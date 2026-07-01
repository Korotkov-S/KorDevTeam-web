import { Blog } from "../components/Blog";
import { SEO } from "../components/SEO";

export function BlogIndexPage() {
  return (
    <>
      <SEO
        title="Блог"
        description="Статьи KorDevTeam про разработку веб-сервисов, CRM, мобильных приложений, автоматизацию бизнеса, интеграции и кейсы команды."
        canonical="https://kordev.team/blog"
        ogType="website"
        ogImage="https://kordev.team/opengraphlogo.jpeg"
      />
      <div className="pt-20">
        <Blog />
      </div>
    </>
  );
}
