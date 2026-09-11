This is an API for a small handmade business that tracks materials and expenses. I have designed this for my own specific use case of making and selling handmade bags. Each product is treated as a unique item made of materials that are recorded and tracked in the system, giving each product a production cost traceable to each constituent part of the product. Overall, the system tracks materials, stock levels, finished objects, the materials that went into each finished object, money in and out, as well logging an audit trail for every change.


POST /finishedObjects/1/process

{
  "salePrice": "20.00",
  "expenses": [
    { "name": "Postage",  "cost": "3.85", "description": "Royal Mail 2nd class" },
    { "name": "Etsy fee", "cost": "1.95", "description": "Platform cut" }
  ]
}
Response:
{
    "id": 1,
    "name": "Quilted Pouch",
    "productionCost": "7",
    "status": "sold",
    "isProcessed": true,
    ...
}

Records the revenue, creates each selling fee as an expense, marks the object processed,
and writes the relavent logs, all in one transaction.

POST /finishedObjects

{   
    "name": "Quilted Pouch",
    "description": "Grey and white quilted star pouch with copper zipper.",
    "categoryId": 2,
    "askingPrice": 20.00,
    "materials": [
    { "materialId": 1, "quantityUsed": "0.5" },
    { "materialId": 2, "quantityUsed": "0.5" }
    ]
}

response:
{
    "id": 1,
    "name": "Quilted Pouch",
    "description": "Grey and white quilted star pouch with copper zipper.",
    "askingPrice": "20",
    "productionCost": "7",
    "status": "unlisted",
    "isProcessed": false,
    ...
}

Creates a finished obejct, links the materials and deducts the stock, calculates the production cost 
and creates the relavent logs, all in one transaction.


This is the backend completed. The front-end is currently in progress.

**Tech Stack**
Node.js + Express
PostgreSQL
Prisma 
Vitest + Supertest
Bcrypt + JWT

