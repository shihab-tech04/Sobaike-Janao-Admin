import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ComplaintLocation } from '@/types/Complaint';

type IncidentLocationRow = {
  division: string | null;
  district: string | null;
  upazila_or_thana: string | null;
  area: string | null;
  road: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

const clean = (value: string | null): string | undefined => value?.trim() || undefined;

export async function getComplaintIncidentLocation(
  complaintId: string
): Promise<Partial<ComplaintLocation> | null> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase complaint service is not configured in this environment.');
  }

  const id = complaintId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('complaints')
    .select(
      'division, district, upazila_or_thana, area, road, landmark, formatted_address, latitude, longitude, place_id'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load incident location: ${error.message}`);
  }
  if (!data) return null;

  const row = data as IncidentLocationRow;
  const hasCoordinates =
    typeof row.latitude === 'number' &&
    typeof row.longitude === 'number' &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude);

  return {
    division: clean(row.division),
    district: clean(row.district),
    upazilaOrThana: clean(row.upazila_or_thana),
    area: clean(row.area),
    road: clean(row.road),
    landmark: clean(row.landmark),
    formattedAddress: clean(row.formatted_address),
    placeId: clean(row.place_id),
    coordinates: hasCoordinates ? [row.latitude as number, row.longitude as number] : undefined,
  };
}
