import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteUserRequestBody {
  user_id: string;
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

    // Create server-side service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller exists in public.admin_users and is active
    const { data: callerAdmin, error: callerAdminError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id, active, is_super_admin")
      .eq("user_id", callerUser.id)
      .maybeSingle();

    if (callerAdminError || !callerAdmin || !callerAdmin.active) {
      return new Response(
        JSON.stringify({
          error: "Access denied. Active administrator account required.",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    const body: DeleteUserRequestBody = await req.json();
    const cleanUserId = (body.user_id || "").trim().toLowerCase();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!cleanUserId || !uuidRegex.test(cleanUserId)) {
      return new Response(
        JSON.stringify({ error: "A valid user ID is required.", code: "INVALID_USER_ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Block self-deletion
    if (callerUser.id.toLowerCase() === cleanUserId) {
      return new Response(
        JSON.stringify({
          error: "You cannot delete your own administrative account.",
          code: "CANNOT_DELETE_SELF",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Verify target administrator exists and check Super Admin status
    const { data: targetAdmin, error: targetQueryError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id, is_super_admin, display_name")
      .eq("user_id", cleanUserId)
      .maybeSingle();

    if (targetQueryError) {
      console.error("Error querying target admin user:", targetQueryError);
      return new Response(
        JSON.stringify({ error: "Failed to query administrator details.", code: "DB_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetAdmin) {
      return new Response(
        JSON.stringify({ error: "Administrator account not found.", code: "USER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Super Admin deletion protection
    if (targetAdmin.is_super_admin) {
      return new Response(
        JSON.stringify({
          error: "Protected system account: Super Administrator cannot be deleted.",
          code: "SUPER_ADMIN_CANNOT_BE_DELETED",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Enforce delegation ceiling:
    // - active designated Super Admin: may delete any non-Super-Admin target, skip the normal delegation-ceiling rejection
    // - normal authorized admin: must still pass can_manage_user_target(p_target_user_id)
    if (!callerAdmin.is_super_admin) {
      const { data: canManageTarget, error: ceilingError } = await supabaseCaller.rpc(
        "can_manage_user_target",
        { p_target_user_id: cleanUserId }
      );

      if (ceilingError || !canManageTarget) {
        return new Response(
          JSON.stringify({
            error: "Access denied. You cannot manage or delete an administrator with permissions that you do not possess.",
            code: "FORBIDDEN",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 10. Fetch target email and role for audit log details
    let targetEmail: string | null = null;
    try {
      const { data: targetAuthUser } = await supabaseAdmin.auth.admin.getUserById(cleanUserId);
      if (targetAuthUser?.user?.email) {
        targetEmail = targetAuthUser.user.email;
      }
    } catch (e) {
      console.warn("Could not retrieve auth email for audit log:", e);
    }

    let previousRoleId: string | null = null;
    try {
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role_id")
        .eq("user_id", cleanUserId)
        .maybeSingle();
      if (roleRow?.role_id) {
        previousRoleId = roleRow.role_id;
      }
    } catch (e) {
      console.warn("Could not retrieve role_id for audit log:", e);
    }

    // 11. Authoritative Auth user deletion via Admin API
    // Foreign key cascade (ON DELETE CASCADE) automatically cascades removal of
    // public.admin_users and public.user_roles rows upon auth.users deletion.
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(cleanUserId);
    if (deleteAuthError) {
      console.error("Auth user deletion failed:", deleteAuthError);
      return new Response(
        JSON.stringify({
          error: deleteAuthError.message || "Failed to delete authentication user.",
          code: "AUTH_DELETION_FAILED",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 12. Verify Post-Delete State (Cascade & Referential Integrity Confirmation)
    // Confirm auth identity is gone
    let authUserCheckData = null;
    let authUserCheckError = null;

    try {
      const response = await supabaseAdmin.auth.admin.getUserById(cleanUserId);
      authUserCheckData = response.data;
      authUserCheckError = response.error;
    } catch (verifyErr) {
      console.error("Auth verify threw unexpected exception:", verifyErr);
      return new Response(
        JSON.stringify({
          error: "Failed to verify authentication identity deletion due to an unexpected Auth API error.",
          code: "POST_DELETE_AUTH_VERIFY_FAILED",
          details: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If getUserById confirms user still exists -> FAIL
    if (authUserCheckData?.user?.id) {
      console.error("Post-delete verification failed: auth identity still exists for", cleanUserId);
      return new Response(
        JSON.stringify({
          error: "Cleanup inconsistency detected: authentication identity remains after delete operation.",
          code: "AUTH_IDENTITY_REMAINS",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Distinguish expected USER_NOT_FOUND from unexpected Auth API failure
    if (authUserCheckError) {
      const errMsg = (authUserCheckError.message || "").toLowerCase();
      const errCode = (authUserCheckError as any).code ? String((authUserCheckError as any).code).toLowerCase() : "";
      const status = (authUserCheckError as any).status;

      const isUserNotFound =
        status === 404 ||
        errCode === "user_not_found" ||
        errCode === "not_found" ||
        errMsg.includes("user not found") ||
        errMsg.includes("not found") ||
        errMsg.includes("user does not exist");

      if (!isUserNotFound) {
        console.error("Unexpected Auth API error during post-delete verification:", authUserCheckError);
        return new Response(
          JSON.stringify({
            error: "Failed to verify authentication identity deletion due to an unexpected Auth API error.",
            code: "POST_DELETE_AUTH_VERIFY_FAILED",
            details: authUserCheckError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Expected user-not-found result -> PASS, continue to database cascade checks
    } else {
      // If there was no error but no valid user (or empty user object):
      // Do not treat an empty user object alone as proof of deletion
      console.error("Post-delete auth verification returned 200 without expected user-not-found error:", authUserCheckData);
      return new Response(
        JSON.stringify({
          error: "Auth post-delete verification failed: expected user-not-found error from Auth API, received unexpected empty response.",
          code: "POST_DELETE_AUTH_VERIFY_FAILED",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirm admin_users record was cascaded
    const { data: remainingAdmin, error: checkAdminError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", cleanUserId)
      .maybeSingle();

    if (checkAdminError) {
      console.error("Post-delete verification query error for admin_users:", checkAdminError);
      return new Response(
        JSON.stringify({
          error: "Post-delete verification query failed for admin_users.",
          code: "POST_DELETE_CHECK_FAILED",
          details: checkAdminError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (remainingAdmin) {
      console.error("Post-delete verification failed: admin_users row still exists for", cleanUserId);
      return new Response(
        JSON.stringify({
          error: "Cleanup inconsistency detected: administrator record was not removed by foreign key cascade.",
          code: "CASCADE_INCONSISTENCY",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirm user_roles records were cascaded
    const { data: remainingRoles, error: checkRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", cleanUserId);

    if (checkRolesError) {
      console.error("Post-delete verification query error for user_roles:", checkRolesError);
      return new Response(
        JSON.stringify({
          error: "Post-delete verification query failed for user_roles.",
          code: "POST_DELETE_CHECK_FAILED",
          details: checkRolesError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (remainingRoles && remainingRoles.length > 0) {
      console.error("Post-delete verification failed: user_roles rows still exist for", cleanUserId);
      return new Response(
        JSON.stringify({
          error: "Cleanup inconsistency detected: user role assignments were not removed by foreign key cascade.",
          code: "CASCADE_INCONSISTENCY",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 13. Record canonical audit event: ADMIN_USER_DELETED (only after successful deletion & verification)
    const auditDetails = {
      target_user_id: cleanUserId,
      display_name: targetAdmin.display_name,
      email: targetEmail,
      previous_role_id: previousRoleId,
      actor: callerUser.id,
      timestamp: new Date().toISOString(),
    };

    let auditLogged = false;
    let callerAuditErrorMsg = "";

    try {
      const { error: callerAuditError } = await supabaseCaller.rpc("log_role_audit_event", {
        p_action: "ADMIN_USER_DELETED",
        p_target_id: cleanUserId,
        p_details: auditDetails,
      });

      if (!callerAuditError) {
        auditLogged = true;
      } else {
        callerAuditErrorMsg = callerAuditError.message || "Caller RPC error";
        console.warn("Caller RPC audit logging failed, attempting service_role fallback:", callerAuditError);
      }
    } catch (auditErr: unknown) {
      callerAuditErrorMsg = auditErr instanceof Error ? auditErr.message : String(auditErr);
      console.warn("Caller RPC audit threw exception, attempting service_role fallback:", auditErr);
    }

    if (!auditLogged) {
      const { error: serviceAuditError } = await supabaseAdmin
        .from("admin_audit_logs")
        .insert({
          actor_id: callerUser.id,
          action: "ADMIN_USER_DELETED",
          target_type: "USER",
          target_id: cleanUserId,
          details: auditDetails,
          created_at: auditDetails.timestamp,
        });

      if (!serviceAuditError) {
        auditLogged = true;
      } else {
        console.error("Both audit paths failed after deleting user:", serviceAuditError);
        return new Response(
          JSON.stringify({
            error: "Administrator was removed, but audit log creation failed permanently.",
            code: "AUDIT_LOG_FAILED",
            details: {
              caller_error: callerAuditErrorMsg,
              service_error: serviceAuditError.message,
            },
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 14. Return clean success response
    return new Response(
      JSON.stringify({
        success: true,
        user_id: cleanUserId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Unexpected Edge Function error in admin-delete-user:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
