// Подписи и цвета статусов проекта.

export const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  in_progress: "В работе",
  on_hold: "Пауза",
  done: "Завершён",
  cancelled: "Отменён",
  paid: "Оплачен",
  has_debt: "Есть долг",
};

export const STATUS_BADGE: Record<string, string> = {
  new: "gray",
  in_progress: "green",
  on_hold: "yellow",
  done: "green",
  cancelled: "gray",
  paid: "green",
  has_debt: "red",
};
