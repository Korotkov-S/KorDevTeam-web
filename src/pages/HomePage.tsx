import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Hero } from "../components/Hero";
import { SEO } from "../components/SEO";
import { ProductSpotlight } from "../components/ProductSpotlight";

const PresentationMaterials = lazy(() =>
  import("../components/PresentationMaterials").then((m) => ({ default: m.PresentationMaterials })),
);
const Services = lazy(() => import("../components/Services").then((m) => ({ default: m.Services })));
const Technologies = lazy(() =>
  import("../components/Technologies").then((m) => ({ default: m.Technologies })),
);
const Projects = lazy(() => import("../components/Projects").then((m) => ({ default: m.Projects })));
const Blog = lazy(() => import("../components/Blog").then((m) => ({ default: m.Blog })));
const UnderMetup = lazy(() =>
  import("../components/UnderMetup").then((m) => ({ default: m.UnderMetup })),
);
const Contact = lazy(() => import("../components/Contact").then((m) => ({ default: m.Contact })));

function DeferredSection({
  id,
  children,
  estimatedHeight,
  rootMargin = "500px",
}: {
  id: string;
  children: React.ReactNode;
  estimatedHeight: number;
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
    <div
      id={id}
      ref={ref}
      aria-busy={!show}
      style={{
        minHeight: `${estimatedHeight}px`,
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${estimatedHeight}px`,
      }}
    >
      {show ? children : null}
    </div>
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
      <DeferredSection id="presentation" estimatedHeight={720} rootMargin="350px">
        <Suspense fallback={null}>
          <PresentationMaterials />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="services" estimatedHeight={760}>
        <Suspense fallback={null}>
          <Services withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="technologies" estimatedHeight={680}>
        <Suspense fallback={null}>
          <Technologies withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="projects" estimatedHeight={980}>
        <Suspense fallback={null}>
          <Projects withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="blog" estimatedHeight={980}>
        <Suspense fallback={null}>
          <Blog withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="under-metup" estimatedHeight={860}>
        <Suspense fallback={null}>
          <UnderMetup withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="contact" estimatedHeight={680}>
        <Suspense fallback={null}>
          <Contact withId={false} />
        </Suspense>
      </DeferredSection>
    </>
  );
}
