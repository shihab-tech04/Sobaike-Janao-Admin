/**
 * Real Map Monitoring API Service Layer
 * Uses controlled SECURITY DEFINER Map RPC when Supabase is configured,
 * ensuring users with 'map.view' can inspect geospatial monitoring datasets
 * without requiring arbitrary row-level 'complaints.view' table reads.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  MapComplaint,
  MapDataset,
  MapSegmentOption,
  MapSubcategoryOption,
} from '@/types/Map';
import { ComplaintLifecycleStatus } from '@/types/Complaint';

export const MAP_MONITORING_CONNECTED = true;

export class MapApi {
  /**
   * Fetch complete geospatial dataset with controlled RPC and taxonomy resolution
   */
  async getMapDataset(): Promise<MapDataset> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase map service is not configured in this environment.');
    }

    // Call controlled SECURITY DEFINER Map RPC
    const { data, error } = await supabase.rpc('admin_get_map_dataset');

    if (error) {
      console.error('admin_get_map_dataset RPC failed:', error);
      throw new Error(`Failed to load map dataset: ${error.message}`);
    }

    if (!data) {
      throw new Error('No map dataset received from server.');
    }

    const rawSegments = Array.isArray(data.segments) ? data.segments : [];
    const rawSubcategories = Array.isArray(data.subcategories) ? data.subcategories : [];
    const rawComplaints = Array.isArray(data.complaints) ? data.complaints : [];
    const serverUnsupportedStatusCount = typeof data.unsupportedStatusCount === 'number'
      ? data.unsupportedStatusCount
      : 0;

    // Build taxonomy lookup maps from returned RPC contract
    const segmentMap = new Map<string, { nameEn: string; nameBn: string }>();
    const segmentOptions: MapSegmentOption[] = rawSegments.map((seg: any) => {
      const id = String(seg.id);
      const nameEn = String(seg.name_en || seg.nameEn || seg.name_bn || seg.nameBn || id);
      const nameBn = String(seg.name_bn || seg.nameBn || seg.name_en || seg.nameEn || id);
      segmentMap.set(id, { nameEn, nameBn });
      return { id, nameEn, nameBn };
    });

    const subcategoryMap = new Map<string, { nameEn: string; nameBn: string; segmentId: string }>();
    const subcategoryOptions: MapSubcategoryOption[] = rawSubcategories.map((sub: any) => {
      const id = String(sub.id);
      const segmentId = String(sub.segment_id || sub.segmentId || '');
      const nameEn = String(sub.name_en || sub.nameEn || sub.name_bn || sub.nameBn || id);
      const nameBn = String(sub.name_bn || sub.nameBn || sub.name_en || sub.nameEn || id);
      subcategoryMap.set(id, { nameEn, nameBn, segmentId });
      return { id, segmentId, nameEn, nameBn };
    });

    // Process, validate status & coordinates, and transform complaints
    const mappedComplaints: MapComplaint[] = [];
    const districtSet = new Set<string>();
    let unmappedCount = 0;
    let clientUnsupportedStatusCount = 0;

    const validStatuses: ComplaintLifecycleStatus[] = [
      'submitted',
      'published',
      'unpublished',
      'rejected',
      'edited',
    ];

    for (const row of rawComplaints) {
      // 1. Defensive status check (server already filters, but maintain client-side contract integrity)
      if (!row.status || !validStatuses.includes(row.status as ComplaintLifecycleStatus)) {
        clientUnsupportedStatusCount++;
        continue;
      }
      const status = row.status as ComplaintLifecycleStatus;

      // 2. Validate coordinates among supported-status records
      const rawLat = row.latitude;
      const rawLng = row.longitude;

      const latNum = rawLat !== null && rawLat !== undefined && rawLat !== '' ? Number(rawLat) : NaN;
      const lngNum = rawLng !== null && rawLng !== undefined && rawLng !== '' ? Number(rawLng) : NaN;

      const isValidCoord =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180 &&
        !(latNum === 0 && lngNum === 0); // Exclude 0,0 null-island coordinates if any

      if (!isValidCoord) {
        unmappedCount++;
        continue;
      }

      const segmentId = String(row.segment_id || row.segmentId || '');
      const subcategoryId = String(row.subcategory_id || row.subcategoryId || '');
      const segInfo = segmentMap.get(segmentId);
      const subInfo = subcategoryMap.get(subcategoryId);

      const districtName = String(row.district || '').trim();
      if (districtName) {
        districtSet.add(districtName);
      }

      mappedComplaints.push({
        id: String(row.id),
        titleEn: String(row.title_en || row.titleEn || row.title || row.id),
        titleBn: String(row.title || row.titleBn || row.title_en || row.titleEn || row.id),
        segmentId,
        segmentEn: segInfo?.nameEn || segInfo?.nameBn || segmentId || '',
        segmentBn: segInfo?.nameBn || segInfo?.nameEn || segmentId || '',
        subcategoryId,
        subcategoryEn: subInfo?.nameEn || subInfo?.nameBn || subcategoryId || '',
        subcategoryBn: subInfo?.nameBn || subInfo?.nameEn || subcategoryId || '',
        status,
        affectedPersonAgeGroup: row.affected_person_age_group ?? row.affectedPersonAgeGroup ?? null,
        allegedAbuserRelationship: row.alleged_abuser_relationship ?? row.allegedAbuserRelationship ?? null,
        reportingFor: row.reporting_for ?? row.reportingFor ?? null,
        latitude: latNum,
        longitude: lngNum,
        location: {
          formattedAddress: String(row.formatted_address || row.formattedAddress || '').trim(),
          division: String(row.division || '').trim(),
          district: districtName,
          upazilaOrThana: String(row.upazila_or_thana || row.upazilaOrThana || '').trim(),
          area: String(row.area || '').trim(),
          road: String(row.road || '').trim(),
          landmark: String(row.landmark || '').trim(),
        },
        createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
      });
    }

    const districts = Array.from(districtSet).sort((a, b) => a.localeCompare(b));
    const unsupportedStatusCount = serverUnsupportedStatusCount + clientUnsupportedStatusCount;
    const totalSourceCount = rawComplaints.length - clientUnsupportedStatusCount;

    return {
      complaints: mappedComplaints,
      totalSourceCount,
      unmappedCount,
      unsupportedStatusCount,
      segments: segmentOptions,
      subcategories: subcategoryOptions,
      districts,
    };
  }
}

export const mapApi = new MapApi();
export default mapApi;
