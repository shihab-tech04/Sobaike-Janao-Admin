import assert from 'node:assert/strict';

// Disposable A11 data is only for the recovered local Supabase fixture.
// The caller must pass a SQL executor already pinned to 127.0.0.1:54322.
export function createPhase17A11Fixture({ sql, roleId, suffix }) {
  assert.equal(typeof sql, 'function');
  assert.match(roleId, /^synthetic_moderator_[a-f0-9]{8}$/);
  assert.match(suffix, /^[a-f0-9]{8}$/);
  const stamp = suffix.toUpperCase();
  const mapIds = ['PUB','SUB','NOGEO'].map(kind => 'SYNTH-A11-' + kind + '-' + stamp);
  const safelyQuoted = mapIds.map(id => "'" + id + "'").join(',');

  function grantMapPermission(granted) {
    sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) " +
      "VALUES ('map.view','map','view','Synthetic Map Read','পরীক্ষামূলক মানচিত্র দেখা') " +
      "ON CONFLICT (id) DO NOTHING");
    if(granted) {
      sql("INSERT INTO public.role_permissions(role_id,permission_id) " +
        "VALUES ('" + roleId + "','map.view') ON CONFLICT DO NOTHING");
    } else {
      sql("DELETE FROM public.role_permissions WHERE role_id = '" + roleId + "' AND permission_id='map.view'");
    }
  }

  function seedMapReports() {
    const fixtures = [
      {id:mapIds[0],title:'A11 synthetic published geospatial report',status:'published',district:'Dhaka',lat:23.7806,lng:90.4074},
      {id:mapIds[1],title:'A11 synthetic submitted geospatial report',status:'submitted',district:'Chattogram',lat:22.3569,lng:91.7832},
      {id:mapIds[2],title:'A11 synthetic report without valid coordinates',status:'submitted',district:'Dhaka',lat:null,lng:null},
    ];
    for(const fixture of fixtures) {
      const lat=fixture.lat===null?'NULL':String(fixture.lat);
      const lng=fixture.lng===null?'NULL':String(fixture.lng);
      const title=fixture.title.replaceAll("'","''");
      sql("INSERT INTO public.complaints(" +
        "id,segment_id,subcategory_id,title,title_en,description,description_en," +
        "incident_date,privacy_choice,division,district,status,origin_type," +
        "latitude,longitude,reporter_name,reporter_contact,publication_preferences) VALUES (" +
        "'" + fixture.id + "','public_safety','synthetic-public-safety'," +
        "'পরীক্ষামূলক মানচিত্র','" + title + "','পরীক্ষার তথ্য'," +
        "'A11 isolated map-only fixture','2026-10-18','anonymous','Dhaka'," +
        "'" + fixture.district + "','" + fixture.status + "','citizen'," +
        lat + "," + lng + "," +
        "'PRIVATE_SYNTHETIC_A11_NAME','PRIVATE_SYNTHETIC_A11_CONTACT'," +
        "'{\"showDescription\":true,\"showGeneralLocation\":true,\"showSubjectName\":false,\"showOrganization\":false}'::jsonb)");
    }
  }

  function removeMapReports() {
    sql('DELETE FROM public.complaints WHERE id IN (' + safelyQuoted + ')');
  }

  function readMapRows() {
    return Number(sql('SELECT count(*) FROM public.complaints WHERE id IN (' + safelyQuoted + ')'));
  }

  return {mapIds,grantMapPermission,seedMapReports,removeMapReports,readMapRows};
}
