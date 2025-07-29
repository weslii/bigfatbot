# Telegram Integration Guide

## Overview

This document provides a comprehensive guide for setting up and using the Telegram integration in Novi. The Telegram integration allows businesses to manage orders through Telegram groups, providing the same functionality as WhatsApp but on the Telegram platform.

## Features

### ✅ Implemented Features

- **Order Processing**: Automatically detect and process orders from Telegram messages
- **Group Setup**: Easy business and group registration via Telegram commands
- **Order Management**: Mark orders as delivered, cancelled, or pending
- **Reports**: Daily, weekly, and monthly order reports
- **AI-Powered Parsing**: Uses OpenAI to extract order details from natural language
- **Multi-Platform Support**: Works alongside WhatsApp without conflicts
- **Database Integration**: Stores all data in the same PostgreSQL database
- **Error Handling**: Comprehensive error handling and notifications
- **Metrics Tracking**: Track bot performance and usage statistics

### 🔄 Order Processing Flow

1. **Message Reception**: Bot receives messages in Telegram groups
2. **Order Detection**: AI analyzes message content to identify orders
3. **Data Extraction**: Extracts customer info, items, address, and total
4. **Order Creation**: Creates structured order in database
5. **Confirmation**: Sends confirmation message to the group
6. **Management**: Allows delivery staff to mark orders as delivered/cancelled

## Setup Instructions

### 1. Create Telegram Bot

1. **Start a chat with @BotFather** on Telegram
2. **Send `/newbot`** command
3. **Choose a name** for your bot (e.g., "Novi Business Bot")
4. **Choose a username** (e.g., "novi_business_bot")
5. **Save the bot token** provided by BotFather

### 2. Environment Configuration

Add the following to your `.env` file:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_PORT=8443

# Platform Configuration
ENABLE_WHATSAPP=true
ENABLE_TELEGRAM=true
```

### 3. Database Migration

Run the database migration to add Telegram support:

```bash
npm run migrate
```

This will add the following columns to the `groups` table:
- `platform` - Distinguishes between WhatsApp and Telegram
- `telegram_chat_id` - Stores Telegram chat IDs
- `telegram_bot_token` - Stores bot tokens (optional)

### 4. Install Dependencies

The following packages are automatically installed:

```bash
npm install node-telegram-bot-api telegraf
```

## Usage Guide

### Business Setup

1. **Create a business** in the Novi dashboard
2. **Get your setup code** (format: `businessname-CODE`)
3. **Add the bot to your Telegram group**
4. **Make the bot an admin** in the group
5. **Use the setup command**: `/setup businessname-CODE`

### Group Types

- **Sales Groups**: Receive customer orders
- **Delivery Groups**: Manage order delivery and status

### Commands

#### Setup Commands
- `/setup <businessname-CODE>` - Register a group for a business

#### Order Management Commands
- `done #<order_id>` - Mark order as delivered
- `cancel #<order_id>` - Cancel an order
- Reply "done" to an order message - Mark as delivered
- Reply "cancel" to an order message - Cancel order

#### Report Commands
- `/daily` - Daily order report
- `/weekly` - Weekly order report
- `/monthly` - Monthly order report
- `/pending` - Show pending orders
- `/help` - Show help message

### Order Format

Customers can place orders in natural language:

```
Hi, I'd like to order:
- 2 pizzas (margherita)
- 1 bottle of coke
- 1 garlic bread

My name is John Doe
Phone: +1234567890
Address: 123 Main Street, City

Total: $25.50
```

The AI will automatically extract:
- Customer name
- Phone number
- Delivery address
- Items and quantities
- Total amount
- Any special notes

## Technical Architecture

### Service Structure

```
src/services/
├── telegram/
│   ├── TelegramCoreService.js      # Connection & auth
│   ├── TelegramMessageHandler.js   # Message processing
│   ├── TelegramOrderHandler.js     # Order operations
│   ├── TelegramSetupHandler.js     # Setup & registration
│   ├── TelegramMetricsService.js   # Performance tracking
│   ├── TelegramEventHandler.js     # Event management
│   └── TelegramUtils.js           # Utility functions
├── TelegramService.js              # Main orchestrator
└── MessageService.js               # Unified interface
```

### Database Schema

The `groups` table now supports both platforms:

```sql
ALTER TABLE groups ADD COLUMN platform VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE groups ADD COLUMN telegram_chat_id VARCHAR(255);
ALTER TABLE groups ADD COLUMN telegram_bot_token VARCHAR(255);
```

### API Endpoints

The existing API endpoints now support platform selection:

```javascript
// Get bot info for specific platform
GET /api/bot/info?platform=telegram

// Get bot info for all platforms
GET /api/bot/info/all

// Add group with platform
POST /api/groups/add
{
  "platform": "telegram",
  "business_id": "...",
  "group_type": "sales",
  "telegram_chat_id": "..."
}
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather | Required |
| `TELEGRAM_BOT_USERNAME` | Bot username | Required |
| `TELEGRAM_WEBHOOK_URL` | Webhook URL for production | Optional |
| `TELEGRAM_WEBHOOK_PORT` | Webhook port | 8443 |
| `ENABLE_TELEGRAM` | Enable Telegram service | true |
| `ENABLE_WHATSAPP` | Enable WhatsApp service | true |

### Webhook vs Polling

- **Development**: Uses polling (default)
- **Production**: Can use webhooks for better performance

To enable webhooks:
```bash
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_PORT=8443
```

## Error Handling

### Common Issues

1. **Bot not responding**
   - Check if bot token is correct
   - Verify bot is added to group
   - Ensure bot has admin permissions

2. **Orders not being processed**
   - Check if group is properly registered
   - Verify group type (sales/delivery)
   - Check AI parsing logs

3. **Setup command not working**
   - Verify setup code format
   - Check if business exists
   - Ensure group is not already registered

### Logging

Telegram-specific logs are prefixed with `[Telegram]`:

```
[Telegram] Bot added to group: 123456789
[Telegram] Processing potential order
[Telegram] Order created: #12345
[Telegram] Error handling message: ...
```

## Security Considerations

1. **Bot Token Security**
   - Never commit bot tokens to version control
   - Use environment variables
   - Rotate tokens regularly

2. **Group Access Control**
   - Only allow bot in authorized groups
   - Monitor group membership changes
   - Implement rate limiting if needed

3. **Data Privacy**
   - All data is stored in your database
   - No data is sent to Telegram servers beyond messages
   - Customer information is protected

## Performance Optimization

### Memory Management
- Message history is limited to 100 messages
- Old pending setups are cleaned up automatically
- Memory usage is monitored and optimized

### Connection Management
- Automatic reconnection on connection loss
- Graceful shutdown handling
- Connection status tracking

### Metrics Tracking
- Message processing time
- Order creation success rate
- Error tracking and reporting

## Troubleshooting

### Bot Not Starting
```bash
# Check environment variables
echo $TELEGRAM_BOT_TOKEN

# Check logs
npm run dev:bot

# Test bot token
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

### Messages Not Processing
```bash
# Check database connection
npm run migrate

# Verify group registration
SELECT * FROM groups WHERE platform = 'telegram';

# Check bot permissions in group
```

### AI Parsing Issues
```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Test AI parsing
node test-order-parser.js
```

## Migration from WhatsApp

If you're migrating from WhatsApp to Telegram:

1. **Export existing data**
2. **Run database migration**
3. **Set up Telegram groups**
4. **Update environment variables**
5. **Test functionality**
6. **Disable WhatsApp if needed**

## Support

For technical support:

1. Check the logs for error messages
2. Verify configuration settings
3. Test with a simple message first
4. Contact support with specific error details

## Future Enhancements

### Planned Features
- [ ] Inline keyboards for order management
- [ ] Photo and document support
- [ ] Payment integration
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] Custom bot commands

### Integration Possibilities
- [ ] Slack integration
- [ ] Discord integration
- [ ] Email notifications
- [ ] SMS notifications
- [ ] Webhook support for external systems

## Contributing

To contribute to the Telegram integration:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This Telegram integration is part of the Novi project and follows the same license terms. 