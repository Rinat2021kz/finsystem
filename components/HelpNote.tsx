// Свёртываемая подсказка «как это работает» — слой понимания (SPEC 4.11).
// Показывается на экранах, где у клиента чаще всего возникают вопросы.

export function HelpNote({
  title = "Как читать этот отчёт",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="panel no-print" style={{ padding: 12, marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>💡 {title}</summary>
      <div className="muted" style={{ fontSize: "0.88rem", marginTop: 8, lineHeight: 1.55 }}>
        {children}
      </div>
    </details>
  );
}
