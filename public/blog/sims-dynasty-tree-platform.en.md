# SimsDynastyTree: Development of Genealogy Tree Service Based on Graphs for The Sims Fans

## Introduction

Creating genealogy trees is a complex task requiring an efficient data structure to represent relationships between people. This is especially relevant for The Sims fans who want to track complex family stories across many generations. In this article, we'll share the development of the [SimsDynastyTree](https://simsdynastytree.com/ru) web service — a specialized platform for creating and maintaining detailed Sims genealogy trees using graphs, customization, subscription system, and international payments.

## About SimsDynastyTree Project

SimsDynastyTree is an online service created by The Sims fans for fans. The platform transforms the standard in-game kinship system into a powerful tool for deep storytelling and preserving the memory of unique dynasties. The service allows creating unlimited trees, adding detailed character information, customizing appearance, and sharing creations with the community.

### Key Platform Features

- **Creating genealogy trees** — building complex family structures
- **Graph-based implementation** — efficient storage and display of relationships
- **Customization** — visual tree and character customization
- **Detailed profiles** — information about relatives, pets, yourself
- **Media albums** — attaching photos to characters and generations
- **Subscription system** — premium features for extended functionality
- **International payments** — ability to purchase subscription from abroad

## Technical Challenges

### Main Task: Representing Genealogy Trees

A genealogy tree is a complex data structure that requires:

1. **Relationship representation** — parents, children, spouses, siblings
2. **Multiple relationships** — one character can have multiple spouses, children from different marriages
3. **Cyclic relationships** — ability to link different trees together
4. **Scalability** — support for unlimited generations
5. **Visualization** — displaying complex structures in an understandable way

### Solution: Using Graphs

Graphs are an ideal data structure for representing genealogy trees:

- **Nodes (vertices)** — characters (Sims)
- **Edges (relationships)** — relationships between characters
- **Relationship types** — parent-child, spouse-spouse, sibling-sibling
- **Metadata** — additional information about relationships

## Solution Architecture

### Graph-Based Data Structure

```
┌─────────────────────┐
│   Graph Database    │
│   (Neo4j/PostgreSQL)│
│                     │
│  Nodes:             │
│  - Characters       │
│  - Pets             │
│  - Trees            │
│                     │
│  Relationships:     │
│  - parent_of        │
│  - spouse_of        │
│  - sibling_of       │
│  - owner_of (pet)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  API Layer          │
│  - Graph Queries    │
│  - CRUD Operations  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Frontend           │
│  - Tree Visualization│
│  - Character Editor │
│  - Customization    │
└─────────────────────┘
```

### Technology Stack

**Frontend:**
- **Next.js** — React framework for SSR
- **TypeScript** — typing
- **D3.js** or **Cytoscape.js** — graph visualization
- **React Flow** — interactive tree building
- **Tailwind CSS** — styling

**Backend:**
- **Node.js** + **AdonisJS** — server-side
- **PostgreSQL** with graph extension or **Neo4j** — graph database
- **Redis** — caching
- **JWT** — authentication

**Integrations:**
- **Stripe** / **PayPal** — international payments
- **Cloudinary** — image storage
- **Email service** — notifications

## Implemented Features

### 1. Creating Genealogy Trees Based on Graphs

#### Graph Structure

Each tree represents a graph where:

**Nodes:**
- `Character` — character (Sim)
- `Pet` — pet
- `Tree` — the tree itself (root node)

**Relationships:**
- `PARENT_OF` — parent → child
- `SPOUSE_OF` — spouse ↔ spouse (bidirectional)
- `SIBLING_OF` — sibling ↔ sibling
- `OWNER_OF` — owner → pet
- `BELONGS_TO` — character → tree

#### Example Data Structure

```
Tree "Smith Dynasty"
  ├─ Character "John Smith" (parent)
  │   ├─ PARENT_OF → Character "Mary Smith"
  │   ├─ PARENT_OF → Character "Tom Smith"
  │   └─ SPOUSE_OF ↔ Character "Jane Smith"
  │
  ├─ Character "Mary Smith"
  │   ├─ PARENT_OF → Character "Lucy Smith"
  │   └─ SPOUSE_OF ↔ Character "Peter Jones"
  │
  └─ Character "Tom Smith"
      └─ OWNER_OF → Pet "Fluffy"
```

### 2. Detailed Character Profiles

Each character can contain extensive information:

#### Basic Information
- Name and surname
- Photo/avatar
- Date of birth
- Date of death (if applicable)
- Gender

#### Game Characteristics
- Character traits
- Career
- Education
- Life aspirations
- Skills

#### Additional Information
- Place of residence
- Custom notes
- Biography
- Life events

#### Pets
- Connection with pets through `OWNER_OF` relationship
- Full pet information (name, breed, photo)

### 3. Tree Customization

The platform provides extensive visual customization options:

#### Visual Tree Settings
- **Color scheme** — palette selection for entire tree
- **Tree background** — various background images
- **Line style** — relationship line styling
- **Layout** — horizontal, vertical, radial

#### Character Customization
- **Avatar styles** — various display options
- **Premium avatars** — exclusive styles for subscribers
- **Node sizes** — character card size settings
- **Icons** — additional visual elements

#### Themes
- Classic
- Modern
- Game-style (The Sims style)
- Custom (create your own theme)

### 4. Media Albums

The system allows attaching photos at different levels:

- **To character** — photos at different age stages
- **To generation** — generation group photos
- **To entire tree** — family photos and events

**Functions:**
- Multiple image uploads
- Album organization
- Captions and descriptions
- Chronological sorting

### 5. Tree Linking (Premium Feature)

For premium users, the function of combining different dynasties is available:

- **Creating connections** between characters from different trees
- **Complex branched universes** — combining multiple family lines
- **Visualization** of linked trees
- **Navigation** between linked trees

### 6. Public and Private Trees

Users can choose tree visibility:

- **Public trees** — accessible for viewing by everyone
- **Private trees** — only for owner
- **Public links** — convenient URLs for public trees
- **Search** — ability to find public trees by name or author

### 7. Subscription System and International Payments

#### Subscription Types

**Free plan:**
- Create up to 3 trees
- Basic customization functions
- Limited number of characters
- Public trees

**Premium subscription:**
- Unlimited number of trees
- Premium avatars and themes
- Linking trees together
- Priority support
- Extended customization options

#### International Payments

The platform supports subscription purchase from abroad:

**Integrated payment systems:**
- **Stripe** — card support from different countries
- **PayPal** — international payments
- **Yandex.Kassa** — for users from Russia and CIS

**Features:**
- Automatic currency detection
- Multiple currency support (USD, EUR, RUB)
- Secure payment processing
- Automatic subscription renewal
- Ability to cancel at any time

## Technical Implementation Details

### Working with Graph Database

#### Creating Characters and Relationships

**Adding new character:**
1. Creating `Character` node with data
2. Linking to tree through `BELONGS_TO`
3. Creating relationships with existing characters

**Adding parent-child relationship:**
1. Checking existence of both characters
2. Creating `PARENT_OF` relationship
3. Automatically creating reverse `CHILD_OF` relationship (if needed)
4. Updating tree visualization

**Adding spouse:**
1. Creating bidirectional `SPOUSE_OF` relationship
2. Updating marriage information in profiles
3. Ability to specify marriage/divorce date

### Graph Visualization

#### Node Placement Algorithm

For beautiful tree display, a placement algorithm is used:

- **Hierarchical placement** — generations on different levels
- **Automatic positioning** — preventing intersections
- **Interactive movement** — user can move nodes
- **Scaling** — zoom in/out for large trees
- **Panning** — navigation through large tree

#### Using React Flow

React Flow provides:
- Ready graph components
- Interactivity (drag & drop)
- Node and relationship customization
- Export to image

### Performance Optimization

#### Caching

- Caching tree structure in Redis
- Caching visualization
- Incremental loading of large trees

#### Lazy Loading

- Loading trees in parts
- Loading characters as needed
- Optimizing graph queries

#### Indexing

- Indexes on frequently used fields
- Indexes on relationships between nodes
- Graph query optimization

## Development Results

### Functionality

✅ **Graph data structure** — efficient storage of complex relationships  
✅ **Unlimited scaling** — support for any tree sizes  
✅ **Detailed profiles** — complete information about characters and pets  
✅ **Visual customization** — extensive customization options  
✅ **Media albums** — photo attachment  
✅ **Subscription system** — platform monetization  
✅ **International payments** — availability from any country  
✅ **Public/private trees** — visibility control  

### Technical Achievements

- **Efficient graph work** — fast queries even for large trees
- **Scalability** — support for thousands of users and trees
- **Payment security** — reliable international transaction processing
- **Performance** — fast loading and tree display
- **User-friendly interface** — intuitive management of complex structures

### User Experience

- **Ease of creation** — simplicity of building trees
- **Visual appeal** — beautiful display
- **Flexibility** — many customization options
- **Social features** — ability to share trees
- **Accessibility** — work from anywhere in the world

## Implementation Features

### Graphs as Architecture Foundation

Using graphs allowed:

- **Natural representation** of family relationships
- **Efficient queries** for finding relatives
- **Flexibility** in adding new relationship types
- **Scalability** for large trees

### Customization as Key Function

Extensive customization options:

- **Visual identity** — each user can create unique style
- **Premium options** — exclusive content for subscribers
- **Flexibility** — from simple to complex customizations

### International Payments

Support for payments from abroad:

- **Multiple providers** — Stripe, PayPal, Yandex.Kassa
- **Automatic currency conversion**
- **Security** — PCI DSS compliance
- **Convenience** — simple payment process

## Conclusion

Development of the SimsDynastyTree platform is a comprehensive project demonstrating effective use of graph data structures to solve real-world problems. The platform successfully combines:

✅ **Graph architecture** for efficient relationship storage  
✅ **Detailed profiles** of characters and pets  
✅ **Visual customization** for creating unique trees  
✅ **Subscription system** with international payments  
✅ **Social functions** for sharing creations  

The platform shows how modern web technologies and data structures can be used to create specialized tools that solve specific community needs.

If you want to create a similar platform or automate processes in your business, we can help develop a solution tailored to your needs.

---

**Want to create a platform with graph data structure or automate processes?** Contact us for a consultation and development of a solution tailored to your needs.

