import { Hero } from "../components/Hero";
import { ProductSpotlight } from "../components/ProductSpotlight";
import { JournalPromo } from "../components/JournalPromo";
import { PresentationMaterials } from "../components/PresentationMaterials";
import { Services } from "../components/Services";
import { Technologies } from "../components/Technologies";
import { Projects, type ProjectCard } from "../components/Projects";
import { Blog, type BlogPost } from "../components/Blog";
import { UnderMetup } from "../components/UnderMetup";
import { Contact } from "../components/Contact";

export function HomePage({ projects = [], posts = [] }: { projects?: ProjectCard[]; posts?: BlogPost[] }) {
  return (
    <>
      <Hero />
      <Projects projects={projects} />
      <ProductSpotlight />
      <JournalPromo />
      <PresentationMaterials />
      <Services />
      <Technologies />
      <Blog mode="preview" posts={posts} />
      <UnderMetup />
      <Contact />
    </>
  );
}
