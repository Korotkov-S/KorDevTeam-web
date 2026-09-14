import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

// Implementation draft: owner/legal review is required before production.
// Approved facts and planned flows: design spec sections 8–10. No vendor or
// security guarantees beyond those facts are asserted here.
const policy = [
  ["Оператор и обращения", "Оператор — индивидуальный предприниматель Коротков Александр Евгеньевич, ИНН 519098647630, ОГРНИП 324330000002550. По вопросам обработки данных напишите на team@korotkov.dev."],
  ["Цели и основания", "Данные обращения обрабатываются для ответа на запрос, обсуждения задачи и подготовки предложения. Основанием служит согласие отправителя; при заключении договора данные обрабатываются также для его исполнения и выполнения требований законодательства."],
  ["Какие данные используются", "Форма обращения предусматривает имя, обязательный телефон, необязательное описание задачи и один необязательный файл. Не указывайте в обращении данные, которые не нужны для обсуждения задачи."],
  ["Обработка и передача", "Обработка включает получение, запись, хранение, использование для ответа, уточнение и удаление данных. Для обработки обращения предусмотрена доставка в Kusidis («Красотуля-CRM») и по электронной почте на team@korotkov.dev с повторной попыткой при сбое. Вложения размещаются в приватном объектном хранилище Timeweb и проходят антивирусную обработку ClamAV. Доступ к данным предоставляется только для работы с обращением."],
  ["Срок хранения", "Копия обращения и вложения на сайте автоматически хранятся 30 дней, после чего удаляются. Дальнейшее хранение деловой переписки и договорных документов определяется целью общения и требованиями законодательства."],
  ["Аналитика", "Для анализа посещений предусмотрены Яндекс.Метрика и Top.Mail.Ru. Аналитика включается после согласия посетителя. Отказ от аналитики не ограничивает использование сайта."],
  ["Защита и права", "Оператор принимает организационные и технические меры для защиты данных от неправомерного доступа. Вы можете запросить сведения об обработке, уточнение или удаление данных, а также отозвать согласие, обратившись на team@korotkov.dev. Прекращение обработки и удаление выполняются с учётом оснований, требующих сохранения данных по закону."],
  ["Изменения политики", "Актуальная редакция политики размещается на этой странице. При изменении целей или состава обработки политика пересматривается."],
];
export function loader({ request }: LoaderFunctionArgs) {
  const privacy = new URL(request.url).pathname.startsWith("/privacy");
  const seo: RouteSeoInput = { pathname: privacy ? "/privacy/" : "/requisites/", kind: "page", indexable: true,
    title: privacy ? "Политика обработки персональных данных" : "Реквизиты",
    description: privacy ? "Цели, состав и сроки обработки персональных данных на сайте KorDevTeam, аналитика и порядок обращения к оператору." : "Реквизиты ИП Коротков Александр Евгеньевич: ИНН, ОГРНИП и электронная почта для связи с KorDevTeam." };
  return data({ seo, privacy }, { headers: documentHeaders });
}
export default function Legal() {
  const { seo, privacy } = useLoaderData<typeof loader>();
  return <article className="container mx-auto max-w-4xl px-4 pt-28 pb-16"><h1 className="text-4xl mb-8">{seo.title}</h1>
    {privacy ? policy.map(([title, body]) => <section className="mb-6" key={title}><h2 className="text-2xl mb-3">{title}</h2><p>{body}</p></section>) : <div className="space-y-4"><p>Индивидуальный предприниматель Коротков Александр Евгеньевич</p><p>ИНН 519098647630</p><p>ОГРНИП 324330000002550</p><p><a href="mailto:team@korotkov.dev">team@korotkov.dev</a></p></div>}</article>;
}
