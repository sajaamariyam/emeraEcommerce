# Emera E-Commerce Platform

A full-stack E-commerce web application built using Node.js, Express, MongoDB, and EJS.  
The platform allows users to browse products, manage carts, place orders, and make online payments.

---

## Tech Stack

Backend  
- Node.js  
- Express.js  

Frontend  
- EJS  
- TailwindCSS  
- JavaScript  

Database  
- MongoDB  
- Mongoose  

Authentication  
- Express Session  
- Bcrypt  

Payment  
- Razorpay

---

## Features

### User
- User registration with OTP verification
- Secure login system
- Product browsing and search
- Cart and wishlist
- Checkout system
- Coupon application
- Razorpay payment integration
- Wallet payment
- Order tracking
- Cancel order or specific items
- Return order after delivery
- Product reviews

### Admin
- Admin dashboard
- Product management
- Category management
- Offer management
- Coupon management
- Order management
- User management
- Sales reports with PDF & Excel export

---

## Project Structure

```
controllers/
models/
routes/
views/
helpers/
middlewares/
config/
public/
```

---

## Environment Variables

Create a `.env` file:

```
MONGO_URI=your_mongodb_uri
SESSION_SECRET=your_secret
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
NODEMAILER_EMAIL=your_email
NODEMAILER_PASSWORD=your_password
```

---

## Installation

Clone the repository

```
git clone https://github.com/sajaamariyam/emeraEcommerce.git
```

Go to project folder

```
cd emeraEcommerce
```

Install dependencies

```
npm install
```

Start server

```
npm start
```

---

## Author

Saja Mariyam  
Mern Stack Developer
