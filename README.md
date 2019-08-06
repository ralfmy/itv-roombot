# ITV RoomBot - Development Version

The development repository for ITV RoomBot, dedicated to testing and trialling new features.

## Latest Progress

### Room Booking

RoomBot uses Google's Calendar API to create (_insert_) new events and book rooms. The user specifies the room, date, time, duration, and event name.

RoomBot has trouble recognising event names.

### Google Assistant Integration

The **assistant.js** Webhook uses the same logic as **slack.js**, but formats responses specifically for the Google Assistant using the _Actions on Google_ library. This version is deployed via the _Actions on Google_ framework as an Alpha release, and is available on the Google Assistant phone app and various Google Home products like the Google Home Mini.

### Hangouts Chat Integration

Tghe **hangouts.js** Webhook uses the same logic as **slack.js**, but formats responses so that they can be displayed in Hangouts Chat. Because Hangouts Chat is not natively supported by the Dialogflow Fulfillment Library, only basic text responses are supported, rather than rich messages.

### Set Office

The Slack client has the ability two switch between Gray's Inn Road and Waterhouse Square offices.
