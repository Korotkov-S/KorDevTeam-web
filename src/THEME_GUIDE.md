# Руководство по настройке темы

## Текущая тема
**KorDevTeam Dark Blue** - темная тема с синими акцентами

## Структура цветов

Все цвета находятся в файле `/styles/globals.css` в двух секциях:
- `:root` - светлая тема (по умолчанию)
- `.dark` - темная тема (используется на сайте)

## Основные цветовые переменные

### Фоновые цвета
- `--background` - основной фон страницы (#0a0e1a)
- `--card` - фон карточек (#141826)
- `--popover` - фон всплывающих окон (#141826)

### Цвета текста
- `--foreground` - основной цвет текста (#e5e7eb)
- `--muted-foreground` - приглушенный текст (#94a3b8)

### Акцентные цвета
- `--primary` - основной акцентный цвет (#3b82f6 - синий)
- `--primary-foreground` - текст на primary (#ffffff)
- `--accent` - дополнительный акцент (#1e40af - темно-синий)
- `--secondary` - вторичный цвет (#1e293b)

### Границы и поля
- `--border` - цвет границ (#1e293b)
- `--input` - фон полей ввода (#1e293b)
- `--ring` - цвет фокуса (#3b82f6)

## Готовые цветовые схемы

### 1. Dark Blue (Текущая)
```css
.dark {
  --background: #0a0e1a;
  --foreground: #e5e7eb;
  --card: #141826;
  --primary: #3b82f6;
  --accent: #1e40af;
  --secondary: #1e293b;
  --border: #1e293b;
  --muted-foreground: #94a3b8;
}
```

### 2. Dark Green
```css
.dark {
  --background: #0a1a0e;
  --foreground: #e5e7eb;
  --card: #142618;
  --primary: #10b981;
  --accent: #059669;
  --secondary: #1e2b1e;
  --border: #1e2b1e;
  --muted-foreground: #94a3b8;
}
```

### 3. Dark Purple
```css
.dark {
  --background: #130a1a;
  --foreground: #e5e7eb;
  --card: #1e1426;
  --primary: #a855f7;
  --accent: #7c3aed;
  --secondary: #251e2b;
  --border: #251e2b;
  --muted-foreground: #94a3b8;
}
```

### 4. Dark Orange
```css
.dark {
  --background: #1a0f0a;
  --foreground: #e5e7eb;
  --card: #261814;
  --primary: #f97316;
  --accent: #ea580c;
  --secondary: #2b1e1e;
  --border: #2b1e1e;
  --muted-foreground: #94a3b8;
}
```

### 5. Dark Cyan
```css
.dark {
  --background: #0a1a1a;
  --foreground: #e5e7eb;
  --card: #142626;
  --primary: #06b6d4;
  --accent: #0891b2;
  --secondary: #1e2b2b;
  --border: #1e2b2b;
  --muted-foreground: #94a3b8;
}
```

### 6. Dark Red
```css
.dark {
  --background: #1a0a0a;
  --foreground: #e5e7eb;
  --card: #261414;
  --primary: #ef4444;
  --accent: #dc2626;
  --secondary: #2b1e1e;
  --border: #2b1e1e;
  --muted-foreground: #94a3b8;
}
```

## Как применить новую тему

### Шаг 1: Откройте файл `/styles/globals.css`

### Шаг 2: Найдите секцию `.dark`
Она начинается примерно со строки 44:
```css
.dark {
  --background: #0a0e1a;
  --foreground: #e5e7eb;
  ...
}
```

### Шаг 3: Замените цвета
Скопируйте выбранную цветовую схему из списка выше и замените значения в секции `.dark`.

### Шаг 4: Дополнительные настройки
Убедитесь, что также обновлены следующие переменные:
- `--card-foreground: #e5e7eb;`
- `--popover: [цвет card];`
- `--popover-foreground: #e5e7eb;`
- `--primary-foreground: #ffffff;`
- `--secondary-foreground: #e5e7eb;`
- `--muted: [цвет secondary];`
- `--accent-foreground: #e5e7eb;`
- `--input: [цвет secondary];`
- `--ring: [цвет primary];`

### Шаг 5: Сохраните и проверьте
Сохраните файл, и изменения применятся автоматически.

## Создание собственной темы

### 1. Выберите основные цвета
- **Primary** - главный акцентный цвет (кнопки, ссылки, иконки)
- **Background** - темный фон (обычно очень темный оттенок primary)
- **Card** - фон карточек (немного светлее background)
- **Secondary** - вторичный цвет (для границ, фонов)

### 2. Рекомендации по цветам
- Background: HSL с L = 5-10% (очень темный)
- Card: на 3-5% светлее background
- Secondary: на 5-10% светлее background
- Primary: яркий насыщенный цвет (L = 50-60%)
- Accent: на 10-15% темнее primary

### 3. Проверка контрастности
Убедитесь, что контраст между:
- `foreground` и `background` ≥ 7:1
- `primary-foreground` и `primary` ≥ 4.5:1
- `muted-foreground` и `background` ≥ 4.5:1

### 4. Инструменты для подбора цветов
- [Coolors.co](https://coolors.co/) - генератор палитр
- [Paletton](https://paletton.com/) - создание гармоничных палитр
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) - проверка контраста

## Примеры использования в коде

### Фон и текст
```tsx
<div className="bg-background text-foreground">
  Основной контент
</div>
```

### Карточки
```tsx
<div className="bg-card text-card-foreground border border-border">
  Содержимое карточки
</div>
```

### Кнопки
```tsx
<button className="bg-primary text-primary-foreground">
  Нажми меня
</button>
```

### Приглушенный текст
```tsx
<p className="text-muted-foreground">
  Вторичная информация
</p>
```

## Градиенты и эффекты

### Градиент от primary
```tsx
<div className="bg-gradient-to-br from-primary/10 via-background to-background">
  Hero секция
</div>
```

### Hover эффекты
```tsx
<div className="border-border hover:border-primary/50 transition-colors">
  Элемент с hover
</div>
```

### Свечение (shadow)
```tsx
<div className="hover:shadow-lg hover:shadow-primary/5">
  Карточка со свечением
</div>
```

## Быстрая смена темы

Если вы хотите быстро протестировать другие цвета без редактирования файла:

1. Откройте DevTools браузера (F12)
2. Перейдите в Console
3. Выполните команду:
```javascript
document.documentElement.style.setProperty('--primary', '#10b981'); // зеленый
document.documentElement.style.setProperty('--accent', '#059669');
```

## Дополнительные настройки

### Радиусы скругления
```css
--radius: 0.625rem; /* 10px - текущий */
```
Измените на:
- `0.375rem` (6px) - меньше скругления
- `1rem` (16px) - больше скругления

### Размер шрифта
```css
--font-size: 16px; /* базовый размер */
```

## Экспорт темы

Чтобы сохранить вашу тему для использования в других проектах:

1. Скопируйте секцию `.dark` из `/styles/globals.css`
2. Сохраните в файл `my-theme.css`
3. Документируйте выбранные цвета в `theme-config.json`

---

**Совет**: Всегда тестируйте тему на всех страницах сайта перед применением в продакшн!
