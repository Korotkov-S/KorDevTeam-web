import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Hero } from "../components/Hero";
import { SEO } from "../components/SEO";

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
        title="Цифровая трансформация вашего бизнеса"
        description="Профессиональная команда разработчиков. Веб-сервисы, мобильные приложения, цифровизация и автоматизация бизнеса."
        canonical="https://kordev.team/"
        ogType="website"
        ogImage="https://kordev.team/opengraphlogo.jpeg"
      />
      <Hero />
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
      <DeferredSection id="projects">
        <Suspense fallback={null}>
          <Projects withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="blog">
        <Suspense fallback={null}>
          <Blog withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="under-metup">
        <Suspense fallback={null}>
          <UnderMetup withId={false} />
        </Suspense>
      </DeferredSection>
      <DeferredSection id="contact" rootMargin="1200px">
        <Suspense fallback={null}>
          <Contact withId={false} />
        </Suspense>
      </DeferredSection>
    </>
  );
}
