import { Hero } from "../components/Hero";
import { Services } from "../components/Services";
import { Technologies } from "../components/Technologies";
import { Projects } from "../components/Projects";
import { KrasotulyaCrm } from "../components/KrasotulyaCrm";
import { Blog } from "../components/Blog";
import { UnderMetup } from "../components/UnderMetup";
import { Contact } from "../components/Contact";

export function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <Technologies />
      <Projects />
      <KrasotulyaCrm />
      <Blog />
      <UnderMetup />
      <Contact />
    </>
  );
}
