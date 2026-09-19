import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Section, SectionHeading } from "../components/public/Section";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

const CONSENT_POLICY_VERSION = "2026-09-18";

const policy = [
  { title: "Оператор и обращения", body: <>Оператор — индивидуальный предприниматель Коротков Александр Евгеньевич, ИНН 519098647630, ОГРНИП 324330000002550. По вопросам обработки данных напишите на <a className="text-[var(--public-blue)] underline underline-offset-4" href="mailto:team@korotkov.dev">team@korotkov.dev</a>.</> },
  { title: "Цели и основания", body: <>Данные обращения обрабатываются для ответа на запрос, обсуждения задачи и подготовки предложения. Основанием служит согласие отправителя; при заключении договора данные обрабатываются также для его исполнения и выполнения требований законодательства.</> },
  { title: "Какие данные используются", body: <>Форма обращения предусматривает имя, обязательный телефон, необязательное описание задачи и один необязательный файл. Не указывайте в обращении данные, которые не нужны для обсуждения задачи.</> },
  { title: "Обработка и передача", body: <>Обработка включает получение, запись, хранение, использование для ответа, уточнение и удаление данных. Для обработки обращения предусмотрена доставка в Kusidis («Красотуля-CRM») и по электронной почте на team@korotkov.dev с повторной попыткой при сбое. Вложения размещаются в приватном объектном хранилище Timeweb и проходят антивирусную обработку ClamAV. Доступ к данным предоставляется только для работы с обращением.</> },
  { title: "Срок хранения", body: <>Копия обращения и вложения на сайте автоматически хранятся 30 дней, после чего удаляются. Дальнейшее хранение деловой переписки и договорных документов определяется целью общения и требованиями законодательства.</> },
  { title: "Аналитика и согласие", body: <>Версия согласия на аналитику — <strong>{CONSENT_POLICY_VERSION}</strong>. Яндекс.Метрика и Top.Mail.Ru загружаются только после явного разрешения. Можно выбрать отказ: без согласия оба счётчика остаются отключёнными, а использование сайта не ограничивается.</> },
  { title: "Защита и права", body: <>Оператор принимает организационные и технические меры для защиты данных от неправомерного доступа. Вы можете запросить сведения об обработке, уточнение или удаление данных, а также отозвать согласие, обратившись на team@korotkov.dev. Прекращение обработки и удаление выполняются с учётом оснований, требующих сохранения данных по закону.</> },
  { title: "Изменения политики", body: <>Актуальная редакция политики размещается на этой странице. При изменении целей или состава обработки политика пересматривается.</> },
] as const;

export function loader({ request }: LoaderFunctionArgs) {
  const privacy = new URL(request.url).pathname.startsWith("/privacy");
  const seo: RouteSeoInput = {
    pathname: privacy ? "/privacy/" : "/requisites/",
    kind: "page",
    indexable: true,
    title: privacy ? "Политика обработки персональных данных" : "Реквизиты",
    description: privacy
      ? "Цели, состав и сроки обработки персональных данных на сайте KorDevTeam, аналитика и порядок обращения к оператору."
      : "Реквизиты ИП Коротков Александр Евгеньевич: ИНН, ОГРНИП и электронная почта для связи с KorDevTeam.",
  };
  return data({ seo, privacy }, { headers: documentHeaders });
}

export default function Legal() {
  const { seo, privacy } = useLoaderData<typeof loader>();
  return (
    <article>
      <Section className="pt-32 lg:pt-36">
        <SectionHeading
          level={1}
          eyebrow={privacy ? "Документы" : "О компании"}
          title={seo.title}
          description={privacy ? `Редакция и версия согласия: ${CONSENT_POLICY_VERSION}` : "Подтверждённые публичные данные оператора."}
        />

        {privacy ? (
          <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.35fr)] lg:items-start">
            <div className="space-y-9">
              {policy.map(({ title, body }, index) => (
                <section key={title} aria-labelledby={`policy-${index}`}>
                  <h2 id={`policy-${index}`} className="text-2xl font-semibold tracking-tight text-[var(--public-ink)]">{title}</h2>
                  <p className="mt-3 max-w-3xl leading-7 text-[var(--public-subtle)]">{body}</p>
                </section>
              ))}
            </div>
            <aside className="rounded-[var(--public-radius-card)] border border-border bg-card p-6 lg:sticky lg:top-28">
              <h2 className="text-xl font-semibold tracking-tight">Настройки аналитики</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--public-subtle)]">Решение можно изменить в любой момент. Повторная настройка откроет тот же выбор разрешить или отклонить аналитику.</p>
              <button
                type="button"
                data-consent-settings="true"
                className="mt-5 rounded-full bg-[var(--public-blue)] px-5 py-3 font-semibold text-[var(--public-action-foreground)] focus-visible:outline-2 focus-visible:outline-offset-4"
                onClick={() => window.dispatchEvent(new window.CustomEvent("kordev:open-consent-settings"))}
              >
                Настроить аналитику повторно
              </button>
            </aside>
          </div>
        ) : (
          <dl className="mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-[var(--public-radius-card)] border border-border bg-card">
            <div className="grid gap-2 p-6 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-[var(--public-subtle)]">Наименование</dt><dd className="font-medium">Индивидуальный предприниматель Коротков Александр Евгеньевич</dd></div>
            <div className="grid gap-2 p-6 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-[var(--public-subtle)]">ИНН</dt><dd className="font-medium">519098647630</dd></div>
            <div className="grid gap-2 p-6 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-[var(--public-subtle)]">ОГРНИП</dt><dd className="font-medium">324330000002550</dd></div>
            <div className="grid gap-2 p-6 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-[var(--public-subtle)]">Email</dt><dd><a className="font-medium text-[var(--public-blue)] underline underline-offset-4" href="mailto:team@korotkov.dev">team@korotkov.dev</a></dd></div>
          </dl>
        )}
      </Section>
    </article>
  );
}
