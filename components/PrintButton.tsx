"use client";

// Экспорт в PDF в MVP — через системную печать браузера (печать в PDF).
// TODO(product): серверная генерация PDF с брендингом консультанта — v2.

export function PrintButton() {
  return (
    <button type="button" className="secondary" onClick={() => window.print()}>
      Сохранить в PDF
    </button>
  );
}
