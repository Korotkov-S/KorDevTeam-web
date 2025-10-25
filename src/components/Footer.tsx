import { Code2, Github, Linkedin, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground">KOR</span>
              </div>
              <span className="text-foreground">KorDevTeam</span>
            </div>
            <p className="text-muted-foreground max-w-md">
              Команда профессиональных разработчиков, специализирующихся на создании 
              современных веб-приложений и мобильных решений.
            </p>
          </div>

          <div>
            <h3 className="mb-4">Услуги</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <a href="#services" className="hover:text-primary transition-colors">
                  Веб-разработка
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary transition-colors">
                  React Native
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary transition-colors">
                  Backend разработка
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary transition-colors">
                  Поддержка WordPress
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4">Контакты</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <a
                  href="mailto:info@kordevteam.com"
                  className="hover:text-primary transition-colors"
                >
                  info@kordevteam.com
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/kordevteam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2025 KorDevTeam. Все права защищены.
          </p>
          
          <div className="flex items-center gap-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Linkedin className="w-5 h-5" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Twitter className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
