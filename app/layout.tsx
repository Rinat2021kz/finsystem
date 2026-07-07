import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ФинУчёт — управленческий учёт для малого бизнеса",
  description:
    "ДДС, ОПУ, баланс денег и понятные отчёты для малого бизнеса Казахстана",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
