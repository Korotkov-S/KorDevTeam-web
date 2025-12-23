# Stone Products Calculator: Automating Estimates and Saving Up to 80% of Time

## Introduction

Creating estimates and commercial proposals for stone products is a complex and time-consuming process. Designers and managers have to manually calculate material costs, work costs, account for product complexity, and create documents. In this article, we'll share a web service we developed for a Moscow company producing stone products. The solution combines a visual drawing editor (similar to a simplified AutoCAD), automatic estimate calculation, and commercial proposal generation, which reduced time spent on creating estimates by up to 80%.

## The Problem: Manual Estimate Calculation Took Too Much Time

### Initial Situation

A Moscow company producing stone products (countertops, sinks, window sills, etc.) faced serious problems when preparing commercial proposals:

**Traditional estimate creation process:**

1. **Creating a drawing** — designer drew a sketch in AutoCAD or on paper
2. **Manual material calculation** — manager manually calculated area, perimeter, number of elements
3. **Work cost calculation** — separately calculated cutting, polishing, installation work
4. **Estimate formation** — all data manually transferred to Excel or Word
5. **Creating commercial proposal** — document formatted manually
6. **Sending to client** — document sent via email

**Time per commercial proposal:** 2-4 hours  
**Number of proposals per day:** 5-10  
**Total time per day:** 10-40 hours of employee work

### Problems with Manual Approach

1. **High labor costs** — each project required a lot of time
2. **Human error** — frequent calculation mistakes
3. **No unified system** — drawing, estimate, and proposal created in different programs
4. **Difficulty with changes** — when changing the drawing, everything had to be recalculated manually
5. **No standardization** — each manager calculated differently
6. **Long preparation** — clients waited for proposals for several days

## Solution: Web Service with Visual Editor and Automatic Estimates

### Solution Concept

We developed a web service that combines:

- **Visual drawing editor** — simplified AutoCAD-like tool right in the browser
- **Product library** — ready-made elements (sinks, countertops, window sills, etc.)
- **Automatic estimate calculation** — all costs calculated automatically
- **Commercial proposal generation** — documents created automatically
- **Email sending** — integration with email service

### Key Web Service Features

#### 1. Visual Drawing Editor

The editor allows creating drawings directly in the browser:

- **Drawing shapes** — rectangles, circles, polygons
- **Measurements** — automatic size calculation
- **Layers** — working with multiple drawing layers
- **Zooming** — convenient zooming and panning
- **Grid and snap** — precise element positioning

#### 2. Ready-Made Product Library

The system contains a catalog of ready-made products:

- **Sinks** — various models with parameters
- **Countertops** — standard and custom sizes
- **Window sills** — typical solutions
- **Stairs** — stair construction elements
- **Decorative elements** — moldings, baseboards, etc.

Each product contains:
- **Dimensions**
- **Material cost**
- **Work cost** (cutting, polishing, installation)
- **Manufacturing time**
- **3D model** for visualization

#### 3. Drag & Drop to Drawing

Products can be dragged from the library to the drawing:

#### 4. Automatic Estimate Calculation

When adding elements to the drawing, the estimate updates automatically:

**What's calculated automatically:**

- **Materials** — stone cost, glue, fasteners
- **Work** — cutting, polishing, installation
- **Additional services** — delivery, lifting, demolition
- **Discounts and markups** — automatic application
- **VAT** — tax calculation
- **Total cost** — project total amount

#### 5. Commercial Proposal Generation

The system automatically creates commercial proposals in PDF format:

#### 6. Email Sending

The ready commercial proposal is automatically sent to the client:

### Technical Implementation

#### Technology Stack

**Frontend:**
- **React** — user interface
- **Fabric.js** or **Konva.js** — library for canvas work (visual editor)
- **React DnD** — drag & drop for dragging products
- **PDF.js** — PDF viewing in browser

**Backend:**
- **Node.js** + **Express** — server-side
- **PostgreSQL** — database (projects, products, estimates)
- **PDFKit** or **Puppeteer** — PDF document generation
- **Nodemailer** — email sending
- **Multer** — file uploads (drawing images)

## Implementation Results

### Time Savings

**Before implementation:**
- Time per commercial proposal: 2-4 hours
- Number of proposals per day: 5-10
- **Total time per day: 10-40 hours**

**After implementation:**
- Time to create project: 15-30 minutes
- Number of proposals per day: 5-10
- **Total time per day: 1.25-5 hours**

**Time savings: up to 80%**

### Quality Improvements

1. **Calculation accuracy** — eliminated errors in estimates
2. **Standardization** — all managers work with unified system
3. **Speed** — clients receive proposals on the day of inquiry
4. **Visualization** — clients see drawing together with estimate
5. **Professionalism** — beautifully formatted documents

### ROI (Return on Investment)

**Development costs:** 600,000 rubles  
**Monthly savings:** 
- 20 working days × 8 hours saved = 160 hours
- 160 hours × 1000 rub/hour = 160,000 rubles

**Payback period:** 3.75 months

**Additional benefits:**
- 300% increase in processed inquiries
- Improved conversion thanks to fast response
- Reduced errors to zero
- Business scalability opportunity

## Conclusion

The web service for automating estimate and commercial proposal creation for stone products showed excellent results:

✅ **Up to 80% time savings** on creating commercial proposals  
✅ **Eliminated errors** in estimate calculations  
✅ **3x increase** in inquiry processing speed  
✅ **Improved quality** of documents and visualization  
✅ **Scalability** — ability to process more inquiries

Combining a visual drawing editor, automatic estimate calculation, and document generation in one web service allowed the company to significantly increase work efficiency and improve customer service quality.

If you want to automate estimate and commercial proposal creation in your business, we can help develop a similar solution for your needs.

---

**Want to automate estimate creation in your business?** Contact us for a consultation and development of a solution tailored to your needs.

