import { Hero } from "../components/Hero";
import { Services } from "../components/Services";
import { Technologies } from "../components/Technologies";
import { Projects } from "../components/Projects";
import { Blog } from "../components/Blog";
import { Contact } from "../components/Contact";

export function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <Technologies />
      <Projects />
      <Blog />
      <Contact />
    </>
  );
}
