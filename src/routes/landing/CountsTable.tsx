const ROWS = [
  { m: 'Views and unique visitors', d: 'Page opens, and how many people.' },
  { m: 'Link clicks and click rate', d: 'Taps per link, against views.' },
  { m: 'Sources', d: 'By UTM tag or referrer.' },
  { m: 'Devices and countries', d: 'Phone or desktop; country from the time zone.' },
  { m: 'Hours of day', d: 'When people open your page.' },
]

/** Table: what the analytics measure, per page. */
export function CountsTable() {
  return (
    <section className="counts" aria-labelledby="counts-title">
      <div className="container">
        <div className="split-head">
          <h2 id="counts-title">What your page counts.</h2>
          <p className="lead">
            Per page, for any range. Export it as <span className="mono">CSV</span> or <span className="mono">JSON</span>.
          </p>
        </div>
        <table className="counts__table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">What it tells you</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.m}>
                <th scope="row">{r.m}</th>
                <td>{r.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
