# Enhanced MT5 Analysis with Moonshot AI and Price Action Analysis

This project provides an enhanced MT5 market scanner with liquidity sweeps detection, advanced technical indicators, price action analysis, and integration with Moonshot AI for intelligent market analysis.

## Features

### Enhanced MT5 Scanner
- Liquidity sweep detection (high/low sweeps with strength measurements)
- Advanced technical indicators (RSI, MACD, Bollinger Bands, ADX)
- Multi-timeframe confluence scoring for more accurate market bias
- Price action pattern recognition (engulfing patterns, pin bars)
- Support/resistance level identification
- Automated trading integration with MT5

### Moonshot AI Integration
- Real-time analysis panel with progress tracking (0-100%)
- Enhanced prompting system with KIMI-AMIS skills framework
- Automated trading recommendations with TP/SL and risk management
- Session-based analysis with real-time status updates

### New Price Action Analysis Features
- **Visual Chart Analysis**: Moonshot AI can analyze chart images for pattern recognition
- **Drawing Tools Integration**: Structured data output for visual overlays and annotations
- **Advanced Pattern Recognition**: Automatic detection of chart patterns, trendlines, and key levels
- **Liquidity Sweep Visualization**: Visual identification of stop hunts and liquidity zones

## API Endpoints

### MT5 Analysis
- `GET /api/mt5/scan` - Basic MT5 market scan
- `GET /api/mt5/scan-enhanced` - Enhanced MT5 scan with liquidity sweeps and advanced indicators
- `POST /api/mt5/trade` - Execute trades directly on MT5 platform

### Moonshot AI Analysis
- `POST /api/moonshot/scan` - Start Moonshot AI analysis session
- `POST /api/moonshot/scan/enhanced` - Enhanced Moonshot AI analysis with real-time updates
- `GET /api/moonshot/status/:sessionId` - Get real-time analysis status
- `POST /api/moonshot/analyze-chart` - Analyze chart data with Moonshot AI for price action insights

## Price Action Analysis Capabilities

With the new price action analysis features, Moonshot AI can now:

1. **Identify Key Levels**: Automatically detect support, resistance, and psychological levels
2. **Recognize Chart Patterns**: Detect common patterns like triangles, wedges, flags, and harmonic patterns
3. **Analyze Trend Lines**: Identify trend continuation and reversal patterns
4. **Spot Liquidity Zones**: Highlight areas where stop hunts and reversals are likely
5. **Provide Trading Setups**: Generate complete trade setups with entries, stops, and targets

## Setup Instructions

1. Install MetaTrader 5 and configure Python integration
2. Install required dependencies: `npm install`
3. Set up environment variables:
   ```
   MOONSHOT_API_KEY=your_api_key_here
   MOONSHOT_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1
   ```
4. Start the server: `npm run dev`

## Usage Examples

### Enhanced Market Scan
```bash
curl http://localhost:3000/api/mt5/scan-enhanced
```

### Price Action Analysis with Moonshot AI
```bash
# First get enhanced scan data
SCAN_DATA=$(curl -s http://localhost:3000/api/mt5/scan-enhanced

# Extract chart data and send to Moonshot AI
curl -X POST http://localhost:3000/api/moonshot/analyze-chart \

  -H "Content-Type: application/json" \

  -d '{"chartData": '"$(echo $SCAN_DATA | jq '.chart_data')"'", "symbol": "EURUSDm"}'
```

### Real-time Analysis Panel
```bash
# Start enhanced analysis session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/moonshot/scan/enhanced | jq -r '.sessionId'

# Monitor progress
curl http://localhost:3000/api/moonshot/status/$SESSION_ID
```

### Automated Trading
```bash
curl -X POST http://localhost:3000/api/mt5/trade \

  -H "Content-Type: application/json" \

  -d '{

    "action": "ORDER_TYPE_BUY",

    "symbol": "EURUSDm",

    "volume": 0.1,

    "price": 1.0850,

    "sl": 1.0830,

    "tp": 1.0870,

    "comment": "AI Generated Trade"

  }'
```

## Technical Architecture

### MT5 Connector (`mt5_connector.py`)
- Direct integration with MetaTrader 5 Python API
- Real-time market data retrieval
- Automated trade execution with error handling
- Fallback mechanisms for offline testing

### MT5 Scanner (`mt5_scanner.py`)
- Enhanced market scanning with liquidity sweeps
- Advanced technical indicator calculations
- Multi-timeframe confluence analysis
- Price action pattern recognition
- Chart data generation for visual analysis

### Server (`server.ts`)
- Express.js backend with RESTful API endpoints
- Moonshot AI integration via bedrock-mantle
- Real-time analysis session management
- Comprehensive error handling and logging

### Moonshot Controller (`moonshot_controller.ts`)
- Real-time analysis panel with progress tracking
- Enhanced prompting system for better AI responses
- Session-based analysis with WebSocket-like updates
- Integration with MT5 scanner for data-driven decisions

## Development

### Adding New Features
1. Extend `mt5_scanner.py` for additional technical indicators
2. Update prompts in `server.ts` for enhanced AI capabilities
3. Add new endpoints to support additional functionality
4. Update the Moonshot controller for real-time panel updates

### Testing
- Unit tests for individual components
- Integration tests for API endpoints
- Manual testing with MT5 for trade execution
- Performance testing for real-time updates