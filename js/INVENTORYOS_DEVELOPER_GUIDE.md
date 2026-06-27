# InventoryOS Developer Guide

Version: 1.0
Author: Dylan Smith
Project: InventoryOS

---

# Project Overview

InventoryOS is a cloud-based inventory management system designed for resellers and small businesses.

The application allows users to:

- Manage inventory
- Create and manage boxes
- Search stock
- Move stock
- Remove stock
- Track sales
- Track expenses
- Print product labels
- Print box labels
- Manage mystery boxes
- View dashboards and analytics
- Detect stale stock
- Manage print jobs

The backend is written in Node.js using Express.

The frontend is HTML, CSS and JavaScript.

The database is PostgreSQL.

The frontend is hosted using Cloudflare Pages.

The backend runs on a Windows PC and is exposed securely using Cloudflare Tunnel.

---

# Live Domains

Main Website

https://inventoryos.co.uk

Customer Application

https://app.inventoryos.co.uk

Backend API

https://api.inventoryos.co.uk

Health Check

https://api.inventoryos.co.uk/api-health

---

# Technology Stack

Frontend

- HTML
- CSS
- JavaScript

Backend

- Node.js
- Express

Database

- PostgreSQL

Hosting

- Cloudflare Pages

Tunnel

- Cloudflare Tunnel

Authentication

- JWT

Version Control

- Git
- GitHub

Operating System

- Windows

---

# Folder Structure

Frontend

InventoryOS Website

Backend

Node.js API

Database

PostgreSQL

Uploads

uploads/

Receipts

uploads/receipts/

---

# Current Infrastructure

User

↓

Cloudflare

↓

Cloudflare Pages

↓

inventoryos.co.uk

↓

JavaScript API Requests

↓

api.inventoryos.co.uk

↓

Cloudflare Tunnel

↓

Node.js Express Server

↓

PostgreSQL Database
