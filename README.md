# ITV RoomBot - Development Version

The development repository for ITV RoomBot, dedicated to testing and trialling new features.

## Latest Progress
### Room Booking
RoomBot uses Google's Calendar API to create (*insert*) new events and book rooms. The user specifies the room, date, time, duration, and event name.

RoomBot has trouble recognising event names.

### Google Assistant Integration
The **assistant.js** Webhook uses the same logic as **slack.js**, but formats responses specifically for the Google Assistant using the *Actions on Google* library. This version is deployed via the *Actions on Google* framework as an Alpha release, and is available on the Google Assistant phone app and various Google Home products like the Google Home Mini.

### Set Office
The Slack client has the ability two switch between Gray's Inn Road and Waterhouse Square offices.
