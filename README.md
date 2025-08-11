# Novi - Multi-Platform Business Bot

Novi is a comprehensive business automation bot that supports both **WhatsApp** and **Telegram** platforms. It provides order management, customer service, and business analytics for small to medium businesses.

## 🚀 Features

### Multi-Platform Support
- **WhatsApp Integration**: Full WhatsApp Business API support with QR code authentication
- **Telegram Integration**: Complete Telegram Bot API support with inline keyboards and callback queries
- **Unified Dashboard**: Single admin interface for managing both platforms
- **Cross-Platform Analytics**: Combined metrics and reporting for both platforms

### Order Management
- **AI-Powered Order Parsing**: Advanced order recognition using OpenAI GPT
- **Pattern Matching**: Fallback parsing for reliable order extraction
- **Real-time Processing**: Instant order processing and confirmation
- **Status Tracking**: Complete order lifecycle management (pending, delivered, cancelled)

### Business Features
- **Multi-Business Support**: Manage multiple businesses from one dashboard
- **Group Management**: Separate sales and delivery groups
- **Automated Reports**: Daily, weekly, and monthly order reports
- **Customer Management**: Track customer information and order history

### Admin Dashboard
- **Real-time Monitoring**: Live bot status and performance metrics
- **Order Management**: View, edit, and manage all orders
- **Business Analytics**: Comprehensive reporting and insights
- **User Management**: Admin user management and permissions

## 🛠️ Installation

### Prerequisites
- Node.js 18.0.0 or higher
- PostgreSQL database
- Redis (optional, for session management)
- Telegram Bot Token (from @BotFather)
- WhatsApp Business API access

### Environment Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd bigfatbot-clean
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment template:
```bash
cp env-template.txt .env
```

4. Configure your environment variables in `.env`:

```env
# Database Configuration
DATABASE_URL=your-database-url

# Redis Configuration (optional)
REDIS_URL=your-redis-url

# Session Configuration
SESSION_SECRET=your-session-secret

# Application Configuration
NODE_ENV=development
PORT=3000

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./sessions

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_USERNAME=your-telegram-bot-username
TELEGRAM_CHAT_ID=your-telegram-chat-id

# OpenAI API Key (for AI order parsing)
OPENAI_API_KEY=your-openai-api-key

# Feature Flags
ENABLE_NEW_PARSER=true
ENABLE_ANALYTICS=true
ENABLE_TRACKING=true
```

### Database Setup

1. Run database migrations:
```bash
npm run migrate
```

2. Seed initial admin user:
```bash
npm run seed
```

### Starting the Application

1. Start the bot service:
```bash
npm start
```

2. Start the web dashboard (in a separate terminal):
```bash
npm run start:web
```

## 🤖 Bot Setup

### WhatsApp Setup
1. Start the bot service
2. Scan the QR code displayed in the console
3. The bot will automatically connect to WhatsApp

### Telegram Setup
1. Create a bot using @BotFather on Telegram
2. Get your bot token and username
3. Add the bot to your groups as an admin
4. Use the `/setup` command in your groups to configure them

## 📱 Platform-Specific Features

### WhatsApp Features
- QR code authentication
- Session management
- Group message processing
- Order parsing and confirmation

### Telegram Features
- Bot token authentication
- Inline keyboard support
- Callback query handling
- Setup command with confirmation buttons
- Message editing and deletion

## 🏢 Business Setup

### Adding a Business
1. Log into the admin dashboard
2. Navigate to the Businesses tab
3. Click "Add Business"
4. Fill in business details
5. Save the business

### Setting Up Groups
1. Go to the Groups section
2. Select your business and platform (WhatsApp/Telegram)
3. Follow the setup instructions for your chosen platform
4. Use the provided setup command in your group

## 📊 Dashboard Features

### Admin Dashboard
- **Overview**: Real-time bot status and performance metrics
- **Orders**: Complete order management and tracking
- **Businesses**: Multi-business management
- **Analytics**: Comprehensive reporting and insights
- **Users**: Admin user management

### User Dashboard
- **Orders**: View and manage business orders
- **Groups**: Manage WhatsApp/Telegram groups
- **Settings**: User preferences and notifications

## 🔧 API Endpoints

### Bot Management
- `GET /api/bot/info` - Get bot information
- `POST /api/bot/restart` - Restart bot services
- `GET /api/bot/qr` - Get WhatsApp QR code
- `GET /api/bot/metrics` - Get bot performance metrics
- `GET /api/bot/connection-status` - Get connection status

### Platform-Specific Endpoints
- `GET /api/whatsapp/bot-info` - WhatsApp bot info
- `POST /api/whatsapp/restart` - Restart WhatsApp bot
- `GET /api/telegram/bot-info` - Telegram bot info
- `POST /api/telegram/restart` - Restart Telegram bot

### Order Management
- `GET /api/orders/:orderId` - Get order details
- `POST /api/orders/:orderId/status` - Update order status
- `DELETE /api/orders/:orderId` - Delete order
- `PUT /api/orders/:orderId` - Update order

## 🧪 Testing

Run the Telegram integration test:
```bash
node test-telegram-integration.js
```

## 📁 Project Structure

```
src/
├── services/
│   ├── whatsapp/          # WhatsApp-specific services
│   ├── telegram/          # Telegram-specific services
│   ├── BotServiceManager.js    # Unified bot management
│   ├── WhatsAppService.js      # WhatsApp service
│   ├── TelegramService.js      # Telegram service
│   └── ...               # Other services
├── controllers/           # API controllers
├── routes/               # API routes
├── views/                # EJS templates
├── middleware/           # Express middleware
├── config/               # Configuration files
└── utils/                # Utility functions
```

## 🔒 Security Features

- **Session Management**: Secure session handling with Redis
- **Authentication**: Admin user authentication
- **Input Validation**: Comprehensive input sanitization
- **Error Handling**: Graceful error handling and logging
- **Memory Optimization**: Automatic memory cleanup and monitoring

## 📈 Performance Features

- **Memory Monitoring**: Automatic memory usage tracking
- **Message History Cleanup**: Automatic cleanup of old messages
- **Database Optimization**: Efficient database queries and indexing
- **Caching**: Redis-based caching for improved performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in the `/docs` folder
- Review the technical documentation in `/docs/03_TECHNICAL_DOCUMENTATION.md`

## 🔄 Changelog

### Version 1.5.1
- ✅ Added full Telegram support
- ✅ Multi-platform bot management
- ✅ Unified admin dashboard
- ✅ Cross-platform analytics
- ✅ Enhanced order parsing
- ✅ Memory optimization improvements
