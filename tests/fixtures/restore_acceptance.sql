-- Compare the complete synthetic case records without printing them.
SELECT count(*) = 2 AND count(*) FILTER (WHERE status = 'closed') = 2
FROM reports_report;

SELECT count(*) = 2 AND bool_and(
    octet_length(content) = 2097152 AND encode(sha256(content), 'hex') = sha256
)
FROM reports_evidence;

SELECT count(*) = 2 AND bool_and(
    event.change->'attachment_ids' = jsonb_build_array(evidence.id::text)
)
FROM reports_reviewevent event
JOIN reports_evidence evidence ON evidence.report_id = event.report_id
WHERE event.action = 'close';

SELECT count(*) FROM django_migrations;
SELECT encode(sha256(convert_to(string_agg(row_to_json(report)::text, E'\n' ORDER BY reference), 'UTF8')), 'hex')
FROM reports_report report;
SELECT encode(sha256(convert_to(string_agg(row_to_json(event)::text, E'\n' ORDER BY id), 'UTF8')), 'hex')
FROM reports_reviewevent event;
