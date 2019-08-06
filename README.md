# ITV RoomBot

## The Problem

The process of finding and booking meeting rooms at ITV offices is leaves a lot to be desired - it's often confusing, convoluted, and crude. ITV staff have consistently voiced their dissatisfaction with the current system and would benefit from a re-thinking and a _technologisation_ of the meeting room experience.

It is possible, with current hardware and software, to make office spaces smarter and more aware and, in turn, help staff be more efficient and productive, and enable them to spend more time working on creating innovative and impactful experiences for ITV audiences.

## The Prototype

ITV RoomBot is a prototype that illustrates the potential ways in which technology can be used to improve the meeting room experience at ITV. It is a Slack bot, built with Google's Dialogflow and hosted on the Google Cloud Platform, that is always available to help out with any queries concerning meeting rooms at ITV's Gray's Inn Road office.

## The Features

### Room Status

- Is 4.6 available now?
- When will 2.3 be free today?
- Who booked 3.1?
- Is 5.1 free at 2pm?
- Is 7.1 available tomorrow from 4-5pm?
- Has anyone booked 3.3 on Monday?

### Room Features & Capacity

- What does 4.2 have?
- Does 3.2 have a TV?
- How many people can 7.2 fit?
- Is there enough space for 10 people in room 2.2?

### Room Search

- Show me available rooms.
- Which rooms are free at 2pm?
- Find me a free room on the second floor.
- Which rooms have iMacs?
- Find me a room with sofas.
- Which rooms can seat 5 people?
- Show me rooms that have TVs and can fit 16 people.
- Find me a room on the third floor that has Hangouts.

### Woof

## The Technologies

### Dialogflow

The natural language processing that allows RoomBot to interpret and act on user queries is handled by Dialogflow. Through Dialogflow, the bot is supplied with phrases, or user utternaces, that it is trained to recognise. As there are many different ways that a user can say the same thing, similar phrases are grouped into **intents** which identify the meaning behind a query and describe how the bot should respond.

When the bot receives a query, Dialogflow performs intent matching, and selects the most appropriate intent. This then triggers a Webhook, written in Node.js, which in turn carries out the necessary steps and makes the necessary API calls in order to provide a response. Essentially, Dialogflow's interface is a front and a gateway to some rather complex logic in the webhook that requests, filters, routes, and formats data, so that it is ready to present to the user. This GitHub repository contains the Webhook **slack.js**, which formats responses specifically for Slack using Slack's [Block Kit API](https://api.slack.com/messaging/composing). The Dialogflow bot is hosted as a project on the Google Cloud Platform; the Webhook is hosted as a Google Cloud Function under the same project.

The _dev_ branch of this repository contains a development version of the Slack Webhook (for testing new features), as well as a version tailored for Google Assistant. Find out more in the README of the _dev_ branch.

### Google APIs

The data that RoomBot displays is retrieved through calls to Google's Calendar and Resources APIs. The Calendar API is used to obtain details about calendar events (time, summary, organiser); the Resources API is used to gather information about rooms (name, location, features, capacity), which is contained and specified within ITV's GSuite Admin.

Read access to the calendar is granted via a service account and authorised by an ITV administrative ID. A customer ID is also required for some API calls.

### Slack

Dialogflow supports a number of integrations - Slack is one of them.
Slack provides a _Client ID_ and _Client Secret_, which is supplied to Dialogflow; conversely Dialogflow provides _OAuth_ and _Events Request_ URLs which are entered into the appropriate Slack app fields. This enables Slack to send user messages and requests to Dialgflow, and subsequently to the Webhook, as well as to receive responses and display them to the user.

RoomBot is registered as a Slack app in the ITV workspace.

### Sensors

!["Sensors"](https://drive.google.com/file/d/1QjPK7adsoBEikTVvEvHVGbzYmbNOmZJw/view?usp=sharing)
An additional component to this prototype is a board of sensors (temperature + humidity, motion) connected to an **Adafruit** microcontroller with WiFi. The idea is to use these sensors in a meeting room to take readings and determine whether or not there are people in the room. This would then allow the bot to respond to the question _"Is there anyone in room **X**"_.

### Google IoT Core & BigQuery

The microcontroller is programmed to take temperature and humidity readings every 10 seconds, as well as detect if an object passes by the motion sensor. It is registered as a device under _Google IoT Core_ and is able to send messages to a _Pub/Sub_ topic. It publishes these readings to the Pub/Sub topic which, via _Dataflow_ which deals with streaming data, pipes them into a _BigQuery_ database table, where they are stored.

The Webhook is then able to programmatically send an SQL query to the BigQuery database and retrieve the temperature, humidity, and motion readings for a specified time period.

### System Architecture

!["RoomBot System Architecture"](https://imgur.com/3em9PHr)
There are currently three different versions of RoomBot - the production Slack version connected to the live calendar; the development Slack version connected to the development calendar; the Assistant versoin connected to the development calendar. Each of these versions has its own Webhook in the form of a Google Cloud Function, hosted under the same Google Cloud project.

## Key Findings

### Integrations

#### Slack

Slack is one of the more prominent and accessible integrations that Dialogflow supports. Although I could have simply used the built-in [Dialogflow Fulfillment Library](https://github.com/dialogflow/dialogflow-fulfillment-nodejs) responses, such as _Card_ and _Button_, I decided to take advantage of Slack's own Messages API in order to create more complex and creative message formats, native to Slack. Because the Dialogflow Fulfillment Library supports custom payload objects, I had RoomBot display custom Slack messages that were built conforming [Slack's message object format](https://api.slack.com/messaging/composing).

Installing RoomBot to the Slack Workspace involved a single button click. Users can interact with the bot via direct message, or by adding it to a channel. At the moment, RoomBot responds to every message posted in a channel - even those not directed at it. This is a work in progress.

#### Assistant

Because of the decision to make custom messages for Slack, I could not just use the exact same Webhook for the Assistant version. Although all of the logic is the same, I needed to re-format the responses specifically for the Google Assistant. There is a special library, [Actions on Google](https://github.com/actions-on-google/actions-on-google-nodejs) for its message formats that integrates directly with the Dialogflow Fulfillment Library. It was therefore relatively simple to convert the Slack messages into Actions on Google messages. This version of the Webhook is available on the _dev_ branch of this GitHub project.

Testing and deployment was done via the Actions on Google Console, where I had to create a new Action and link it to the Dialogflow bot. The Console provides an Assistant simulator, where I could test the bot and view its responses. I also installed the Assistant app on my iPhone and tested it there as well. I found that the simulator did not always reflect real world usage - there were some slight behavioural differences between the simulator and the actual phone, so it was difficult to trust the simulator at times, and often easier to catch bugs when testing on the phone.

The Actions on Google Console allowed me to deploy the Action in Alpha version to a select number of users, whose emails I provided.
RoomBot is invoked in the Assistant with the phrase _"Talk to ITV RoomBot"_, where _ITV RoomBot_ is the name of the Action - this phrase isn't further customisable and must be said by the user in order to interact with RoomBot.

I also tested RoomBot on a Google Home Mini, a screenless smart speaker with Assistant built in. When it worked, it worked as expected and provided spoken responses. However, it did have some trouble correctly recognising user queries (possibly due to environmental factors like echo, accent), and would therefore provide the "incorrect" response (in the sense that it was the correct response for what it thought was said, but incorrect in what was actually asked for). Because the Home Mini does not have a screen, it was quite difficult to debug and see precisely what was going wrong, as I was unable to see what its detected user input was. Whereas on Slack, because queries are typed rather than voiced, the user is always in control of what they ask and can see exaclty what is being sent to the bot.

#### Hangouts Chat

Similar to other integrations, integrating RoomBot with Hangouts Chat was primarily a matter of formatting the responses for the platform. However, because Hangouts Chat is not natively supported by the Dialogflow Fulfillment Library, like Slack and Assistant are, messages are restricted to simple text-based formats rather than more complicated rich messages. Hangouts Chat does support its own form of rich messages, with cards and images, but these appear to be limited to bots developed solely for Hangouts Chat via [Google Apps Script or Cloud Functions](https://developers.google.com/hangouts/chat/concepts/) - this is again due to the fact that the Dialogflow Fulfillment Library does not support Hangouts Chat.

I also discovered that there are different versions of Hangouts, and that Hangouts Chat is separate from the Hangouts invoked in Gmail, and from Hangouts Meet. Hangouts Chat needs to be enabled first on an administrative level, and then on a user level. Once I set up Hangouts Chat on my account, I was able to install RoomBot and start messaging it.

#### Amazon Alexa

While Dialogflow offers some support for Alexa integration (it is listed under the _Integrations_ tab), it is rather rudimental. This boils down to Amazon having their own platform, akin to Dialogflow, for building Alexa Skills. So while it is possible to import Dialogflow intents and entities to the Alexa Skills console, the logic and message formats have to be re-written to be compatible with Alexa.

### Versioning

As of August 2019, Dialogflow has an experimental beta feature that lets developers to create different environments and publish versions of a bot to these environments. Detailed in this [documentation](https://cloud.google.com/dialogflow/docs/agents-versions), versions and environments in Dialogflow would allow for "separate environments for testing, development, and production." From my understanding, each environment would have its own, isolated version of the bot with a link to its own Webhook, as well as its own set of integrations (with different credentials).

However, in trying out this feature and creating development and production environments, the version of the bot in each environment used the same source Webhook and the smae set of integrations. My goal was two have two versions of RoomBot - one that pulled from the live production Webhook and had one set of Slack app credentials, and another that pulled from the development Webhook and had another set of Slack app credentials. But I was unable to get this feature working. Understandably, it is still in beta, but it would be an extremely helpful and welcome addition to Dialogflow.
