import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    authors?: string[];
    tags?: string[];
  };
}

export function SEO({
  title,
  description,
  canonical,
  ogImage = "https://kordev.team/opengraphlogo.jpeg",
  ogType = "article",
  article,
}: SEOProps) {
  const fullTitle = `${title} | KorDevTeam`;
  const canonicalUrl = canonical?.startsWith("http") 
    ? canonical 
    : `https://kordev.team${canonical || ""}`;

  const baseJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://kordev.team/#organization",
      name: "KorDevTeam",
      url: "https://kordev.team/",
      logo: "https://kordev.team/opengraphlogo.jpeg",
      sameAs: ["https://t.me/kordevteam"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://kordev.team/#website",
      name: "KorDevTeam",
      url: "https://kordev.team/",
      publisher: {
        "@id": "https://kordev.team/#organization",
      },
      inLanguage: "ru-RU",
    },
  ];

  const articleJsonLd = article
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description: description,
        image: ogImage,
        datePublished: article.publishedTime,
        dateModified: article.modifiedTime || article.publishedTime,
        author: {
          "@type": "Organization",
          name: "KorDevTeam",
          url: "https://kordev.team",
        },
        publisher: {
          "@type": "Organization",
          name: "KorDevTeam",
          logo: {
            "@type": "ImageObject",
            url: "https://kordev.team/opengraphlogo.jpeg",
            width: 640,
            height: 640,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonicalUrl,
        },
        keywords: article.tags?.join(", "),
      }
    : null;
  const jsonLd = articleJsonLd ? [...baseJsonLd, articleJsonLd] : baseJsonLd;

  return (
    <Helmet>
      {/* Основные мета-теги */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:site_name" content="KorDevTeam" />
      {article?.publishedTime && (
        <meta property="article:published_time" content={article.publishedTime} />
      )}
      {article?.modifiedTime && (
        <meta property="article:modified_time" content={article.modifiedTime} />
      )}
      {article?.tags?.map((tag, index) => (
        <meta key={index} property="article:tag" content={tag} />
      ))}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
