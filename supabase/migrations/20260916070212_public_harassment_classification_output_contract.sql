DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  v_hits integer;
BEGIN
  -- Single published report.
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_public_published_report'
    AND p.prokind = 'f';

  v_old := '    ''incidentDate'', to_char(c.incident_date, ''YYYY-MM-DD''),' || chr(10);
  v_new := v_old
    || '    ''affectedPersonAgeGroup'', c.affected_person_age_group,' || chr(10)
    || '    ''allegedAbuserRelationship'', c.alleged_abuser_relationship,' || chr(10)
    || '    ''reportingFor'', c.reporting_for,' || chr(10);
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Safety check failed for get_public_published_report incidentDate fragment: % matches', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);

  -- Published report collection.
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_public_published_reports'
    AND p.prokind = 'f';

  v_old := '        ''incidentDate'', to_char(c.incident_date, ''YYYY-MM-DD''),' || chr(10);
  v_new := v_old
    || '        ''affectedPersonAgeGroup'', c.affected_person_age_group,' || chr(10)
    || '        ''allegedAbuserRelationship'', c.alleged_abuser_relationship,' || chr(10)
    || '        ''reportingFor'', c.reporting_for,' || chr(10);
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Safety check failed for get_public_published_reports incidentDate fragment: % matches', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);

  -- Ranked home feed: project the fields into the CTE, then emit them.
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_public_home_feed'
    AND p.prokind = 'f';

  v_old := '      c.incident_date,' || chr(10);
  v_new := v_old
    || '      c.affected_person_age_group,' || chr(10)
    || '      c.alleged_abuser_relationship,' || chr(10)
    || '      c.reporting_for,' || chr(10);
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Safety check failed for get_public_home_feed CTE fragment: % matches', v_hits;
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := '        ''incidentDate'', to_char(bc.incident_date, ''YYYY-MM-DD''),' || chr(10);
  v_new := v_old
    || '        ''affectedPersonAgeGroup'', bc.affected_person_age_group,' || chr(10)
    || '        ''allegedAbuserRelationship'', bc.alleged_abuser_relationship,' || chr(10)
    || '        ''reportingFor'', bc.reporting_for,' || chr(10);
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'Safety check failed for get_public_home_feed JSON fragment: % matches', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$migration$;
