# ITV RoomBot

---

## The Problem
The process of finding and booking meeting rooms at ITV offices is leaves a lot to be desired - it's often confusing, convoluted, and crude. ITV staff have consistently voiced their dissatisfaction with the current system and would benefit from a re-thinking and a *technologisation* of the meeting room experience.

It is possible, with current hardware and software, to make office spaces smarter and more aware and, in turn, help staff be more efficient and productive, and enable them to spend more time working on creating innovative and impactful expriences for ITV audiences.

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

## The Technologies
### Dialogflow
The natural language processing that allows RoomBot to interpret and act on user queries is handled by Dialogflow. Through Dialogflow, the bot is supplied with phrases, or user utternaces, that it is trained to recognise. As there are many different ways that a user can say the same thing, similar phrases are grouped into **intents** which identify the meaning behind a query and describe how the bot should respond.

When the bot receives a query, Dialogflow performs intent matching, and selects the most appropriate intent. This then triggers a Webhook, written in Node.js, which in turn carries out the necessary steps and makes the necessary API calls in order to provide a response. Essentially, Dialogflow's interface is a front and a gateway to some rather complex logic in the webhook that requests, filters, routes, and formats data, so that it is ready to present to the user. This GitHub repository contains the Webhook **slack.js**, which formats responses specifically for Slack using Slack's [Block Kit API](https://api.slack.com/messaging/composing). The Dialogflow bot is hosted as a project on the Google Cloud Platform; the Webhook is hosted as a Google Cloud Function under the same project.

The *dev* branch of this repository contains a development version of the Slack Webhook (for testing new features), as well as a version tailored for Google Assistant. Find out more in the README of the *dev* branch.

### Google APIs
The data that RoomBot displays is retrieved through calls to Google's Calendar and Resources APIs. The Calendar API is used to obtain details about calendar events (time, summary, organiser); the Resources API is used to gather information about rooms (name, location, features, capacity), which is contained and specified within ITV's GSuite Admin. 

Read access to the calendar is granted via a service account and authorised by an ITV administrative ID. A customer ID is also required for some API calls.

### Slack
Dialogflow supports a number of integrations - Slack is one of them.
Slack provides a *Client ID* and *Client Secret*, which is supplied to Dialogflow; conversely Dialogflow provides *OAuth* and *Events Request* URLs which are entered into the appropriate Slack app fields. This enables Slack to send user messages and requests to Dialgflow, and subsequently to the Webhook, as well as to receive responses and display them to the user.

RoomBot is registered as a Slack app in the ITV workspace. 

### Sensors
![alt text](https://drive.google.com/file/d/1QjPK7adsoBEikTVvEvHVGbzYmbNOmZJw/view?usp=sharing "Sensors")
An additional component to this prototype is a board of sensors (temperature + humidity, motion) connected to an **Adafruit** microcontroller with WiFi. The idea is to use these sensors in a meeting room to take readings and determine whether or not there are people in the room. This would then allow the bot to respond to the question *"Is there anyone in room **X**"*. 

### Google IoT Core & BigQuery
The microcontroller is programmed to take temperature and humidity readings every 10 seconds, as well as detect if an object passes by the motion sensor. It is registered as a device under *Google IoT Core* and is able to send messages to a *Pub/Sub* topic. It publishes these readings to the Pub/Sub topic which, via *Dataflow* which deals with streaming data, pipes them into a *BigQuery* database table, where they are stored.

The Webhook is then able to programmatically send an SQL query to the BigQuery database and retrieve the temperature, humidity, and motion readings for a specified time period.

### System Architecture
![alt text][RoomBot System Architecture]
[RoomBot System Architecture]: https://drive.google.com/file/d/1_iZ_Q9qaRV-DEq_gdsRiDCtF480diepe/view?usp=sharing "RoomBot System Architecture"
