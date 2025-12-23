# Harmonize Me Platform: Comprehensive Development of Online Psychology Courses with Gamification and AI Support

## Introduction

Creating a full-featured educational platform with gamification elements, bonus system, personal accounts, and AI assistant integration is a complex task requiring a comprehensive approach. In this article, we'll share the development of the [Harmonize Me](https://iharmo.com/ru) web platform — online psychology courses for weight management that combines educational content, game mechanics, motivation system, and artificial intelligence for user support.

## About Harmonize Me Project

Harmonize Me is an online platform that helps people cope with excess weight and improve nutrition through psychological work. The platform combines psychology and game mechanics, offering a modern and effective solution for eating behavior problems.

### Key Platform Features

- **Online courses** — structured video courses with assignments and meditations
- **Personal accounts** — individual space for each user
- **Bonus system** — bonus accrual for completing lessons and assignments
- **Mini-shop** — ability to spend bonuses on additional materials
- **Publications** — knowledge base with useful articles and materials
- **AI psychologist bot** — 24/7 user support through chat bot
- **Gamification** — game elements to increase motivation

## Development Tasks and Challenges

### Technical Requirements

1. **Multi-level course system**
   - Platform courses with fixed prices
   - Course constructor with thematic video selection
   - Free introductory course
   - Different access formats (step-by-step opening or full access)

2. **User system and personal accounts**
   - Registration and authorization
   - User profiles with progress tracking
   - Course completion history
   - Subscription and access management

3. **Bonus and motivation system**
   - Bonus accrual for activity
   - Internal shop (HarmoMarket) for bonus exchange
   - Achievement and reward system
   - Recommendation mechanism through social networks

4. **AI assistant integration**
   - 24/7 user support
   - Contextual understanding of requests
   - Emotional support
   - Integration with courses and materials

5. **Content management**
   - Course and lesson management
   - Video upload and storage
   - Publications and articles
   - Media library

## Solution Architecture

### General Platform Structure

```
┌─────────────────────┐
│   Frontend (React)  │
│   - Personal Account│
│   - Courses         │
│   - Shop            │
│   - AI Chat         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Backend (Node.js)  │
│  - API              │
│  - Business Logic   │
│  - Integrations     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Database (PG)      │
│  - Users            │
│  - Courses          │
│  - Bonuses          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  External Services  │
│  - Video Hosting    │
│  - AI API           │
│  - Payments         │
└─────────────────────┘
```

### Technology Stack

**Frontend:**
- **Next.js** — React framework for SSR and optimization
- **TypeScript** — typing for code reliability
- **Tailwind CSS** — interface styling
- **React Query** — state management and caching
- **Zustand** — global application state

**Backend:**
- **Node.js** + **AdonisJS** — server-side
- **PostgreSQL** — main database
- **Redis** — caching and sessions
- **JWT** — user authentication

**Integrations:**
- **OpenAI API** — AI assistant for user support
- **Video hosting** — storage and streaming of course videos
- **Payment systems** — processing course payments

## Implemented Features

### 1. Personal Account System

Personal account is a central place for each user where they can:

- **Track progress** — see completed courses and lessons
- **Manage subscriptions** — activate and renew course access
- **View bonuses** — see accumulated bonuses and accrual history
- **Configure profile** — edit personal data and preferences

**Key components:**

- **Dashboard** — main page with activity overview
- **Progress bars** — visualization of course completion
- **Activity history** — log of all user actions
- **Settings** — account and notification management

### 2. Course System

The platform supports several course types:

#### Platform Courses

Fixed courses with defined structure:
- "Eat with pleasure"
- "I look with love"
- "My beloved body"

**Features:**
- Step-by-step lesson opening (one lesson per day)
- Or full access immediately
- Progress bar for tracking completion
- Assignments and meditations after each lesson

#### Course Constructor

User can build their own course by choosing from 49 thematic videos:
- All videos available immediately
- Can start with any lesson
- Checklist for tracking viewed videos
- Personalized therapeutic path

#### Free Introductory Course

For familiarization with platform methodology:
- Short video clips
- Basic techniques
- Opportunity to evaluate approach before purchase

**Course system functions:**

- **Video player** — built-in player with progress control
- **View tracking** — automatic progress saving
- **Assignments** — interactive assignments after lessons
- **Meditations** — audio meditations for practice
- **Certificates** — certificate issuance after course completion

### 3. Bonus System and Gamification

One of the key platform features — game mechanics to increase motivation:

#### Bonus Accrual

Bonuses are awarded for:
- **Watching lessons** — for each viewed lesson
- **Completing assignments** — for activity in assignments
- **Finishing courses** — bonus for full completion
- **Daily activity** — for regular platform visits
- **Challenges** — for completing special assignments

#### Internal HarmoMarket Shop

Accumulated bonuses can be spent on:
- **Access to online groups** — participation in therapeutic groups
- **Books and materials** — additional literature
- **Trainings** — access to additional trainings
- **Premium content** — exclusive materials

#### Game Elements

- **Progress map** — visualization of therapy path
- **Levels and rewards** — each lesson as a new level
- **Achievements** — badges for various activities
- **Rating** — progress comparison with other users (optional)

### 4. Mini Product Shop

The platform's internal shop allows:

- **Browse catalog** — all available products and services
- **Filter by categories** — courses, materials, groups
- **Use bonuses** — payment with bonuses or combination with money
- **Manage cart** — adding products and checkout
- **Purchase history** — view all purchases

**Product types:**
- Full courses
- Individual lessons
- Books and materials
- Access to therapeutic groups
- Individual consultations

### 5. Publications and Knowledge Base

Section with useful materials:

- **Articles** — expert articles on nutrition psychology
- **Video materials** — additional video lectures
- **Infographics** — visual materials for better understanding
- **Podcasts** — audio content for listening
- **Checklists** — practical tools for work

**Functions:**
- Search through materials
- Filtering by topics
- Saving to favorites
- Commenting and discussion

### 6. AI Psychologist Bot for Support

One of the most innovative platform features — AI assistant integration:

#### AI Bot Capabilities

- **24/7 availability** — support around the clock
- **Emotional support** — understanding and empathy
- **Contextual responses** — considering user history and completed courses
- **Personalized recommendations** — advice based on progress
- **Crisis support** — help in difficult situations

#### Platform Integration

AI bot has access to:
- User progress in courses
- Completed materials
- Personal preferences
- Interaction history

This allows giving relevant advice and recommendations.

#### Technical Implementation

- **OpenAI GPT** — foundation for understanding and generating responses
- **Fine-tuning** — training on nutrition psychology data
- **Context window** — saving dialogue history
- **Moderation** — checking responses for safety

## Technical Implementation Details

### Database Structure

**Main tables:**

- `users` — platform users
- `courses` — courses and their metadata
- `lessons` — lessons within courses
- `user_progress` — user progress
- `bonuses` — bonus system and transactions
- `shop_items` — shop products
- `purchases` — purchase history
- `publications` — articles and publications
- `ai_conversations` — AI dialogue history

### Course API

**Main endpoints:**

- `GET /api/courses` — list of all courses
- `GET /api/courses/:id` — course details
- `GET /api/courses/:id/lessons` — course lessons
- `POST /api/courses/:id/enroll` — enroll in course
- `POST /api/lessons/:id/complete` — mark lesson as completed
- `GET /api/user/progress` — user progress

### Bonus System

**Accrual logic:**

- When watching lesson → +10 bonuses
- When completing assignment → +20 bonuses
- When finishing course → +100 bonuses
- Daily login → +5 bonuses
- Completing challenge → +50 bonuses

**Deduction mechanism:**

- Purchasing product in shop
- Paying for group access
- Acquiring premium content

### AI Bot Integration

**Architecture:**

1. **Receive request** from user
2. **Collect context** — progress, courses, history
3. **Form prompt** for AI
4. **Call OpenAI API**
5. **Process response** and moderation
6. **Save dialogue** to database
7. **Send response** to user

**Features:**

- Saving conversation context
- Considering user emotional state
- Recommendations based on completed materials
- Safety and ethics of responses

## Development Results

### Functionality

✅ **Full-featured platform** with all declared capabilities  
✅ **Personal accounts** with progress tracking  
✅ **Course system** with different access formats  
✅ **Gamification** and bonus system  
✅ **Internal shop** for bonus exchange  
✅ **Knowledge base** with publications  
✅ **AI assistant** for 24/7 support  

### Technical Achievements

- **Scalable architecture** — readiness for user base growth
- **Performance optimization** — fast loading and platform operation
- **Security** — protection of user data and payments
- **Multilingual** — support for Russian and English
- **Responsive design** — work on all devices

### User Experience

- **Intuitive interface** — ease of navigation and use
- **Motivation through gamification** — increased engagement
- **Personalization** — individual approach to each user
- **24/7 support** — help availability at any time

## Implementation Features

### Gamification as Key Element

Game mechanics integrated at all levels:

- **Progress bars** — visualization of achievements
- **Badges and achievements** — rewards for activity
- **Progress map** — visual therapy path
- **Levels** — each lesson as a new level
- **Bonuses** — currency for motivation

### AI Integration for Support

AI bot doesn't just answer questions, but:

- **Understands context** — considers user progress
- **Gives relevant advice** — based on completed materials
- **Supports emotionally** — empathetic responses
- **Recommends materials** — suggests relevant content

### Flexible Course System

Platform supports different formats:

- **Fixed courses** — structured program
- **Course constructor** — personalized path
- **Step-by-step opening** — motivation through anticipation
- **Full access** — freedom to choose pace

## Conclusion

Development of the Harmonize Me platform is a comprehensive project combining modern technologies, psychology, and game mechanics. The platform successfully solves the task of helping people work with excess weight and eating behavior through:

✅ **Structured courses** with professional content  
✅ **Gamification** to increase motivation  
✅ **Bonus system** to retain users  
✅ **AI support** for 24/7 assistance  
✅ **Personalization** for individual needs  

The platform demonstrates how modern web technologies can be used to create effective educational solutions with gamification elements and artificial intelligence.

If you want to create a similar educational platform or automate processes in your business, we can help develop a solution tailored to your needs.

---

**Want to create an educational platform or automate processes?** Contact us for a consultation and development of a solution tailored to your needs.

