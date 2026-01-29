import { Hero } from "../components/Hero";
import { Services } from "../components/Services";
import { Technologies } from "../components/Technologies";
import { Projects } from "../components/Projects";
import { Blog } from "../components/Blog";
import { UnderMetup } from "../components/UnderMetup";
import { Contact } from "../components/Contact";
import { SEO } from "../components/SEO";

export function HomePage() {
  return (
    <>
      <SEO
        title="Цифровая трансформация вашего бизнеса"
        description="Профессиональная команда разработчиков. Веб-сервисы, мобильные приложения, цифровизация и автоматизация бизнеса."
        canonical="https://kordev.team/"
        ogType="website"
        ogImage="https://kordev.team/opengraphlogo.jpeg"
      />
      <Hero />
      <Services />
      <Technologies />
      <Projects />
      <Blog />
      <UnderMetup />
      <Contact />
    </>
  );
}
