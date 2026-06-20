import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Hero } from "../components/Hero";
import { SEO } from "../components/SEO";
import { ProductSpotlight } from "../components/ProductSpotlight";
import { PresentationMaterials } from "../components/PresentationMaterials";
import { Contact } from "../components/Contact";

const Services = lazy(() => import("../components/Services").then((m) => ({ default: m.Services })));
const Technologies = lazy(() =>
  import("../components/Technologies").then((m) => ({ default: m.Technologies })),
);
const Projects = lazy(() => import("../components/Projects").then((m) => ({ default: m.Projects })));
const Blog = lazy(() => import("../components/Blog").then((m) => ({ default: m.Blog })));
const UnderMetup = lazy(() =>
  import("../components/UnderMetup").then((m) => ({ default: m.UnderMetup })),
);

function DeferredSection({
  id,
  children,
  rootMargin = "900px",
}: {
  id: string;
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, show]);

  return (
    <>
      {/* Якорь всегда в DOM, чтобы меню/скролл работали даже до загрузки секции */}
      <div id={id} ref={ref} />
      {show ? children : null}
    </>
  );
}

export function HomePage() {
  return (
    <>
      <SEO
        title="Автоматизация продаж и операционных процессов"
        description="KorDevTeam разрабатывает CRM, веб-сервисы, мобильные приложения и интеграции под ключ. У нас есть собственный продукт Красотуля-CRM для малого бизнеса."
        canonical="https://kordev.team/"
        ogType="website"
        ogImage="https://kordev.team/opengraphlogo.jpeg"
      />
      <Hero />
      <ProductSpotlight />
      <PresentationMaterials />
      <DeferredSection id="services">
        <Suspense fallback={null}>
          <Services withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="technologies">
        <Suspense fallback={null}>
          <Technologies withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="projects" rootMargin="2400px">
        <Suspense fallback={null}>
          <Projects withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="blog" rootMargin="2200px">
        <Suspense fallback={null}>
          <Blog withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="under-metup">
        <Suspense fallback={null}>
          <UnderMetup withId={false} />
        </Suspense>
      </DeferredSection>
      <Contact />
    </>
  );
}
