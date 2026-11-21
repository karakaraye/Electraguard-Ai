import { reportStatuses, type ReportDetail } from "./observer/report-types";

const lagosDateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
});

export function formatReportTime(value: string) {
  return `${lagosDateTime.format(new Date(value))} WAT`;
}

export function ReportDetails({ report }: { report: ReportDetail }) {
  return (
    <>
      <dl className="report-details">
        <dt>Reference</dt><dd>{report.reference}</dd>
        <dt>Status</dt><dd>{reportStatuses[report.status]}</dd>
        <dt>Incident date and time</dt><dd>{formatReportTime(report.occurred_at)}</dd>
        <dt>Approximate location</dt><dd>{report.location}</dd>
        {report.polling_unit_code && <><dt>Polling-unit code</dt><dd>{report.polling_unit_code}</dd></>}
        <dt>Description</dt><dd>{report.description}</dd>
      </dl>
      <h2>Private evidence</h2>
      {report.attachments.length === 0 ? <p>No evidence attached.</p> : (
        <ul className="report-list">
          {report.attachments.map((attachment) => (
            <li key={attachment.id}>
              <a href={`/api/reports/${report.reference}/attachments/${attachment.id}`}>
                {attachment.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
