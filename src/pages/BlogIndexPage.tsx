import { Blog } from "../components/Blog";
import { SEO } from "../components/SEO";

export function BlogIndexPage() {
  return (
    <>
      <SEO
        title="Блог"
        description="Статьи KorDevTeam про разработку, автоматизацию и кейсы."
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
