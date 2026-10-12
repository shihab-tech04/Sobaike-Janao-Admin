import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface ComplaintParty {
  id: string;
  complaintId: string;
  name: string;
  partyType: 'individual' | 'business' | 'group' | 'organization' | 'unknown' | string;
  roleOrDesignation?: string;
  organization?: string;
  phoneOrContact?: string;
  publicProfileHandle?: string;
  address?: string;
  identifyingDescription?: string;
  createdAt: string;
}

interface ComplaintPartyRpcRow {
  id: string;
  complaint_id: string;
  name: string | null;
  party_type: string | null;
  role_or_designation: string | null;
  organization: string | null;
  phone_or_contact: string | null;
  public_profile_handle: string | null;
  address: string | null;
  identifying_description: string | null;
  created_at: string;
}

export async function getComplaintParties(complaintId: string): Promise<ComplaintParty[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const cleanComplaintId = complaintId.trim();
  if (!cleanComplaintId) return [];

  const { data, error } = await supabase.rpc('admin_get_complaint_parties', {
    p_complaint_id: cleanComplaintId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to load complaint parties.');
  }

  if (!Array.isArray(data)) return [];

  return (data as ComplaintPartyRpcRow[]).map((row) => ({
    id: row.id,
    complaintId: row.complaint_id,
    name: row.name?.trim() || '',
    partyType: row.party_type?.trim() || 'unknown',
    roleOrDesignation: row.role_or_designation?.trim() || undefined,
    organization: row.organization?.trim() || undefined,
    phoneOrContact: row.phone_or_contact?.trim() || undefined,
    publicProfileHandle: row.public_profile_handle?.trim() || undefined,
    address: row.address?.trim() || undefined,
    identifyingDescription: row.identifying_description?.trim() || undefined,
    createdAt: row.created_at,
  }));
}
