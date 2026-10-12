import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserRequestBody {
  email: string;
  password: string;
  display_name?: string | null;
  role_id: string;
  active?: boolean;
}

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Only POST is accepted." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate environment configuration
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables in Edge Function.");
      return new Response(
        JSON.stringify({
          error: "Edge Function is misconfigured. Missing server-side credentials.",
          code: "CONFIG_ERROR",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Extract and verify caller Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required.", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client representing the caller (with their JWT)
    const supabaseCaller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: callerUser }, error: callerAuthError } = await supabaseCaller.auth.getUser();
    if (callerAuthError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session.", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify caller authorization: must have 'admin_users.manage' or be Super Admin
    const { data: hasManagePermission, error: permError } = await supabaseCaller.rpc(
      "has_permission",
      { p_permission_id: "admin_users.manage" }
    );

    if (permError || !hasManagePermission) {
      return new Response(
        JSON.stringify({
          error: "Access denied. User management authorization required.",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Parse and validate request body
    const body: CreateUserRequestBody = await req.json();
    const cleanEmail = (body.email || "").trim().toLowerCase();
    const cleanPassword = body.password || "";
    const cleanDisplayName = (body.display_name || "").trim() || null;
    const cleanRoleId = (body.role_id || "").trim();
    const cleanActive = body.active !== undefined ? Boolean(body.active) : true;

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required.", code: "INVALID_EMAIL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Password validation
    if (!cleanPassword || cleanPassword.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters long.",
          code: "WEAK_PASSWORD",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role ID validation
    if (!cleanRoleId) {
      return new Response(
        JSON.stringify({ error: "A role must be assigned to the user.", code: "ROLE_REQUIRED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create server-side service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 6. Verify designated Super Admin exists before normal user creation (prevents bootstrap lockout)
    const { data: superAdminRows, error: superAdminCheckError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("is_super_admin", true)
      .eq("active", true)
      .limit(1);

    if (superAdminCheckError) {
      console.error("Super Admin check error:", superAdminCheckError);
      return new Response(
        JSON.stringify({ error: "Failed to verify system administrator configuration.", code: "DB_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!superAdminRows || superAdminRows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "A Super Administrator must be designated before normal administrators can be created.",
          code: "SUPER_ADMIN_NOT_CONFIGURED",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Verify role exists and is active
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id, active")
      .eq("id", cleanRoleId)
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Selected role does not exist.", code: "ROLE_NOT_FOUND" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!roleData.active) {
      return new Response(
        JSON.stringify({ error: "Cannot assign an inactive role.", code: "ROLE_INACTIVE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7b. ENFORCE DELEGATION CEILING: Verify caller can manage/assign this role
    const { data: canManageRole, error: roleScopeError } = await supabaseCaller.rpc(
      "can_manage_role_scope",
      { p_role_id: cleanRoleId }
    );

    if (roleScopeError || !canManageRole) {
      return new Response(
        JSON.stringify({
          error: "Access denied. You cannot assign a role containing permissions that you do not possess.",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Create Supabase Auth user with confirmed email via Admin API
    const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: cleanDisplayName ? { display_name: cleanDisplayName } : {},
    });

    if (createAuthError || !authUser.user) {
      console.error("Auth user creation failed:", createAuthError);
      const isDuplicate =
        createAuthError?.message?.toLowerCase().includes("already registered") ||
        createAuthError?.message?.toLowerCase().includes("duplicate") ||
        createAuthError?.status === 422;

      return new Response(
        JSON.stringify({
          error: isDuplicate
            ? "An account with this email address already exists."
            : createAuthError?.message || "Failed to create authentication user.",
          code: isDuplicate ? "EMAIL_ALREADY_EXISTS" : "AUTH_CREATION_FAILED",
        }),
        { status: isDuplicate ? 409 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authUser.user.id;

    // 9. Finalize admin membership, role assignment, and audit log via SECURITY DEFINER RPC
    // Using caller client so caller is recorded as the actor
    const { data: finalizeData, error: finalizeError } = await supabaseCaller.rpc(
      "admin_finalize_user_membership",
      {
        p_user_id: newUserId,
        p_display_name: cleanDisplayName,
        p_role_id: cleanRoleId,
        p_active: cleanActive,
      }
    );

    // 10. COMPENSATING ROLLBACK: If membership finalization fails, delete the created Auth user
    if (finalizeError) {
      console.error(
        `admin_finalize_user_membership failed for user ${newUserId}, executing compensating rollback:`,
        finalizeError
      );

      let rollbackFailed = false;
      let rollbackErrorMessage: string | null = null;

      try {
        const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(newUserId);
        if (deleteUserError) {
          rollbackFailed = true;
          rollbackErrorMessage = deleteUserError.message || "deleteUser returned error";
          console.error(
            `Rollback deleteUser returned error for user ${newUserId}:`,
            deleteUserError
          );
        }
      } catch (rollbackThrown) {
        rollbackFailed = true;
        rollbackErrorMessage =
          rollbackThrown instanceof Error ? rollbackThrown.message : "Unknown thrown error during deleteUser";
        console.error(`Rollback threw exception for user ${newUserId}:`, rollbackThrown);
      }

      if (rollbackFailed) {
        // CASE B: Rollback failed - critical error
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Critical system error: Failed to finalize user profile, and automatic rollback could not remove the authentication record.",
            code: "MEMBERSHIP_FINALIZATION_ROLLBACK_FAILED",
            original_code: finalizeError.code || "MEMBERSHIP_FINALIZATION_FAILED",
            original_error: finalizeError.message,
            rollback_error: rollbackErrorMessage,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CASE A: Rollback succeeded - return original finalization failure truthfully
      return new Response(
        JSON.stringify({
          success: false,
          error: finalizeError.message || "Failed to finalize administrative user profile.",
          code: finalizeError.code || "MEMBERSHIP_FINALIZATION_FAILED",
          details: finalizeError.details,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Return clean success response
    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        email: cleanEmail,
        display_name: cleanDisplayName,
        role_id: cleanRoleId,
        active: cleanActive,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Unexpected Edge Function error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
