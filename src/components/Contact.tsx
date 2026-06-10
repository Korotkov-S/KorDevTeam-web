import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Mail, MessageSquare, Send } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

export function Contact({ withId = true }: { withId?: boolean } = {}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    budget: "",
    timeline: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          page: typeof window !== "undefined" ? window.location.href : "kordev.team",
        }),
      });

      if (!res.ok) {
        throw new Error("Contact request failed");
      }

      toast.success(t("contact.thanks"));
      setFormData({ name: "", contact: "", budget: "", timeline: "", message: "" });
    } catch {
      toast.error(t("contact.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: any) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <section {...(withId ? { id: "contact" } : {})} className="py-28 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 text-sm">
              {t("contact.title")}
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            {t("contact.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            {t("contact.subtitle")}
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-6">
            {[
              {
                icon: Mail,
                title: t("contact.email"),
                href: "mailto:team@korotkov.dev",
                label: "team@korotkov.dev",
              },
              {
                icon: MessageSquare,
                title: t("contact.telegram"),
                href: "https://t.me/ideamen51",
                label: "@ideamen51",
              },
              {
                icon: MessageSquare,
                title: t("contact.max"),
                href: "https://max.ru/u/f9LHodD0cOJpymJqsmOnWwFeDCCZGy15ba7H_HhajC8Vnm6U12_ZrsEX8uY",
                label: "Геннадий Коротков",
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ y: -8 }}
                  className="group"
                >
                  <Card className="relative h-full p-6 rounded-2xl bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300">
                    <CardHeader>
                      <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-xl font-bold text-foreground mb-2">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-muted-foreground">
                        <a
                          href={item.href}
                          target={item.href.startsWith("http") ? "_blank" : undefined}
                          rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                          className="text-blue-400 hover:underline"
                        >
                          {item.label}
                        </a>
                      </CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Card className="relative h-full p-0 rounded-2xl bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10">
              <CardHeader className="px-6 pt-6 sm:px-8 sm:pt-8">
                <CardTitle className="text-2xl font-bold text-foreground">
                  {t("contact.sendMessage")}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t("contact.sendDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder={t("contact.yourName")}
                    required
                    autoComplete="name"
                  />
                  <Input
                    name="contact"
                    value={formData.contact}
                    onChange={handleChange}
                    placeholder={t("contact.yourContact")}
                    required
                    autoComplete="email"
                  />
                  <Input
                    name="budget"
                    value={formData.budget}
                    onChange={handleChange}
                    placeholder={t("contact.budget")}
                  />
                  <Input
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleChange}
                    placeholder={t("contact.timeline")}
                  />
                  <Textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={t("contact.messagePlaceholder")}
                    required
                    className="sm:col-span-2 min-h-36"
                  />
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="sm:col-span-2 bg-blue-600 hover:bg-blue-700 text-white border-0"
                  >
                    <Send className="w-4 h-4" />
                    {isSubmitting ? t("contact.sending") : t("contact.send")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
