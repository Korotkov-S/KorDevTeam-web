export const CASE_VIDEO_PATH = "/cases/teharmatura-automation/";
const originalVideoUrl = "https://bc767411-eeed330e-54b2-4c7b-9c68-7b4b6a155cc6.s3.twcstorage.ru/projects/portfolio/teharmatura-automation/krany-balashikhi-bitrix24-1c-697f83b62476.mp4";
export const CASE_VIDEO = {
  src: "/assets/krany-balashikhi-bitrix24-1c.f63a128648a8.mp4",
  poster: "/projects/portfolio/teharmatura-automation/krany-balashikhi-bitrix24-1c-poster.jpg",
  name: "Краны Балашихи. От письма до заказа в 1С",
  description: "Тестовая демонстрация интеграции Битрикс24 и 1С. Разбор заявки из PDF, проверка позиций, создание заказа в 1С и возврат его номера в CRM.",
  uploadDate: "2026-11-10T08:22:34.399Z",
  duration: 303.4,
  chapters: [
    { start: 0, name: "Маршрут заявки от письма до заказа" },
    { start: 25, name: "Разбор PDF и сверка позиций с каталогом" },
    { start: 58, name: "Проверка позиций и выбор базы 1С в Битрикс24" },
    { start: 94, name: "Передача сделки через коннектор и создание заказа в 1С" },
    { start: 129, name: "Возврат номера заказа и статусы в CRM" },
    { start: 166, name: "Заявка с сайта и возврат оплаты и отгрузки из 1С" },
    { start: 208, name: "Архивный BI-отчёт по спросу, сделкам и оплатам" },
    { start: 260, name: "План переноса интеграции в рабочий контур" },
  ],
};

export function readCaseVideoStart(pathname: string, params: URLSearchParams): number | null {
  if (pathname !== CASE_VIDEO_PATH) return null;
  const [value, extra] = params.getAll("t");
  if (value === undefined || extra !== undefined || !/^(?:0|[1-9]\d{0,2})$/.test(value)) return null;
  const seconds = Number(value);
  return seconds < CASE_VIDEO.duration ? seconds : null;
}

export function removeCaseVideoLink(pathname: string, body: string): string | null {
  if (pathname !== CASE_VIDEO_PATH) return null;
  const blocks = body.split(/\r?\n\r?\n/);
  const index = blocks.findIndex(block => block.startsWith("[") && !block.includes("\n")
    && [originalVideoUrl, CASE_VIDEO.src].some(url => block.endsWith(`](${url})`)));
  if (index < 0) return null;
  blocks.splice(index, 1);
  return blocks.join("\n\n");
}
