# OyaEat Backend

## Admin Login (Separate from Vendor)
- Endpoint: POST /admin/auth/login
- Body: { "email": "<admin-email>", "password": "<admin-password>" }
- Response: { token, admin }
- Use the token in Authorization: Bearer <token> for admin routes under /admin/*

## Seed an Admin User
- Set environment variables (no secrets in code):
  - ADMIN_EMAIL
  - ADMIN_PASSWORD
  - ADMIN_PHONE (optional)
  - ADMIN_FIRST_NAME (optional)
  - ADMIN_LAST_NAME (optional)
- Run: npm run seed:admin
- Behavior:
  - Updates an existing user with ADMIN_EMAIL to role=admin
  - Or creates a new admin user with phoneVerified=true

## Cloudinary Document Storage
- Configure environment:
  - CLOUDINARY_CLOUD_NAME
  - CLOUDINARY_API_KEY
  - CLOUDINARY_API_SECRET
- Upload flow:
  - POST /vendor/{businessId}/upload-documents (multipart form)
  - Files are uploaded to Cloudinary; BusinessDocument.url stores secure_url

## Swagger Docs
- Visit: http://localhost:5000/api-docs
- YAML source: docs/openapi.yaml
- Use "Authorize" to set Bearer token for admin endpoints

## Vendor Flow
- Register: POST /auth/register
- Verify Phone: POST /auth/verify-phone
- Login (Vendor): POST /auth/login
- Business Details: POST /vendor/{userId}/business-details
- Upload Documents: POST /vendor/{businessId}/upload-documents
- Bank Details: POST /vendor/{businessId}/bank or POST /vendor/bank
- Status: GET /vendor/{userId}/status
