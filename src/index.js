require('dotenv').config()
const cron      = require('./cron')
const dashboard = require('./dashboard')

dashboard.start()
cron.start()
