"use strict";
const VERSION = "1.0";
const RELEASE_DATE = "09/08/2019";

/* REQUIREMENTS */
const functions = require("firebase-functions");
const { google } = require("googleapis");
const { WebhookClient } = require("dialogflow-fulfillment");
const { Text, Card, Payload, Suggestion } = require("dialogflow-fulfillment");
const bigquery = require("@google-cloud/bigquery");
const request = require("request-promise-native"); // For third-party HTTP requests

/* APIs */
const calendar = google.calendar("v3");
const admin = google.admin("directory_v1");

/* ADMIN */
var adminId = process.env.ADMIN_ID;
var custId = process.env.CUST_ID;

/* SERVICE ACCOUNT */
const serviceAccountAuth = new google.auth.JWT(
  process.env.SA_CLIENT_EMAIL,
  null,
  process.env.SA_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/admin.directory.resource.calendar"],
  adminId
);

/* BIGQUERY CLIENT */
const BigQueryClient = new bigquery({ project_id: "roombot-oknmqj" });

/* INTENTs */
const SEARCH_ROOMS_INTENT = "Search Rooms";
const SEARCH_ROOMS_FOLLOWUP_INTENT = "Search Rooms - yes";
const ROOM_STATUS_INTENT = "Room Status";
const ROOM_FEATURE_INTENT = "Room Feature";
const ROOM_CAPACITY_INTENT = "Room Capacity";
const ROOM_OCCUPANCY_INTENT = "Room Occupancy";
const BOOK_ROOM_INTENT = "Book Room";
const BOOK_ROOM_FOLLOWUP_INTENT = "Book Room - yes";
const GITHUB_INTENT = "GitHub";
const HELP_INTENT = "Help";
const DOG_INTENT = "Dog";

/* APPLICATION CONSTANTS */
const ERROR_MSG = "Oops! Looks like my developer messed up somewhere! Apologies on his behalf!";
const INVALID_ROOM_MSG = "I'm sorry, but I can't seem to find that room.\n Could you please try again?";

const TIME_ZONE_OFFSET = "+01:00";

var OFFICE_ID = 0;

const ICONS = {
  Phone: "https://img.icons8.com/color/48/000000/phone.png",
  TV: "https://img.icons8.com/color/48/000000/retro-tv.png",
  Sofas: "https://img.icons8.com/color/48/000000/sofa.png",
  Mac: "https://img.icons8.com/color/48/000000/imac.png",
  "Hangouts Meet": "https://img.icons8.com/color/48/000000/hangout.png",
  conference: "https://img.icons8.com/color/48/000000/conference-foreground-selected.png",
  available: "https://img.icons8.com/color/48/000000/ok.png",
  busy: "https://img.icons8.com/color/48/000000/minus.png",
  cal_green: "https://img.icons8.com/color/48/000000/today.png",
  cal_red: "https://img.icons8.com/color/48/000000/leave.png",
  cal_sched: "https://img.icons8.com/color/48/000000/overtime.png"
};

const GREEN = "#00C853";
const RED = "#F50057";

/* API FUNCTIONS */
function getRooms(officeId) {
  var apiQuery;
  if (officeId) {
    apiQuery = 'buildingId="London Waterhouse Square"';
  } else {
    apiQuery = 'buildingId="London Gray\'s Inn Road"';
  }
  return new Promise((resolve, reject) => {
    admin.resources.calendars.list(
      {
        auth: serviceAccountAuth,
        customer: custId,
        query: apiQuery
      },
      (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          resolve(res);
        }
      }
    );
  });
}

// Check if a meeting room is busy within a certain period of time
function calFreebusy(timeMin, timeMax, emails) {
  return new Promise((resolve, reject) => {
    calendar.freebusy.query(
      {
        auth: serviceAccountAuth,
        resource: {
          timeMin: timeMin,
          timeMax: timeMax,
          calendarExpansionMax: 50,
          orderBy: "resourceName",
          items: emails
        }
      },
      (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log(res.data.calendars);
          resolve(res);
        }
      }
    );
  });
}

// List the events of a certain calendar resource
function calEventsList(calendarId, timeMin, timeMax) {
  var today = new Date().toISOString().split("T")[0] + "T00:00:00" + TIME_ZONE_OFFSET;
  return new Promise((resolve, reject) => {
    calendar.events.list(
      {
        auth: serviceAccountAuth,
        calendarId: calendarId,
        timeMin: timeMin,
        timeMax: timeMax
      },
      (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log(res.data);
          resolve(res);
        }
      }
    );
  });
}

// Insert a new calendar event
function calEventsInsert(calendarId, resource) {
  return new Promise((resolve, reject) => {
    calendar.events.insert({ auth: serviceAccountAuth, calendarId: calendarId, resource: resource }, (err, res) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        console.log("EVENT CREATED");
        resolve(res);
      }
    });
  });
}

// Get Slack user information - for booking rooms
function slackGetUserProfile() {
  return new Promise((resolve, reject) => {
    request.get(`https://slack.com/api/users.profile.get?token=${process.env.SLACK_OAUTH_TOKEN}&pretty=1`, (err, res) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

// Dog
function dogAPI() {
  return new Promise((resolve, reject) => {
    request.get("https://api.giphy.com/v1/gifs/random?api_key=PKYwC19VlyF2Ve7ezkKSHqrBWHNg3fiu&tag=dog&rating=G", (err, res) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

/* HELPER FUNCTIONS */
function dateTimeInterpreter(date, time, timePeriod) {
  var timeStart;
  var timeEnd;
  var dateTimeStart;
  var dateTimeEnd;
  var queryType = 1; // 0: general; 1: specific

  const todate = new Date();

  if (date === "") {
    // If no date is supplied, assume today's date
    date = todate.toISOString().split("T")[0];
  }

  if (timePeriod === "" && time) {
    // "...now"; "...3pm"
    dateTimeStart = new Date(date + "T" + time);
    dateTimeEnd = new Date(date + "T23:59:59" + TIME_ZONE_OFFSET);
  } else if (timePeriod === "" && !time) {
    // "...today"; "...tomorrow"; "...later"
    if (date > todate.toISOString().split("T")[0]) {
      dateTimeStart = new Date(date + "T01:00:00" + TIME_ZONE_OFFSET);
    } else {
      dateTimeStart = new Date(
        date +
          "T" +
          `${todate.getHours() + parseInt(TIME_ZONE_OFFSET[2])}`.padStart(2, "0") +
          ":" +
          `${todate.getMinutes()}`.padStart(2, "0") +
          ":" +
          `${todate.getSeconds()}`.padStart(2, "0") +
          TIME_ZONE_OFFSET
      );
    }
    dateTimeEnd = new Date(date + "T23:59:59" + TIME_ZONE_OFFSET);
    queryType = 0;
  } else {
    // "...from 3-4pm"
    timeStart = timePeriod.startTime.split("T")[1];
    timeEnd = timePeriod.endTime.split("T")[1];
    dateTimeStart = new Date(date + "T" + timeStart);
    dateTimeEnd = new Date(date + "T" + timeEnd);
  }

  return { date: date, timeStart: timeStart, timeEnd: timeEnd, dateTimeStart: dateTimeStart, dateTimeEnd: dateTimeEnd, queryType: queryType };
}

function nameFromEmail(email) {
  var name = email.split("@")[0];
  var first = name.split(".")[0];
  var last = name.split(".")[1];
  first = first[0].toUpperCase() + first.slice(1);
  last = last ? last[0].toUpperCase() + last.slice(1) : "";
  return first + " " + last;
}

function formatTime(dateTimeString) {
  return new Date(dateTimeString).toLocaleString("en-GB", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "Europe/London"
  });
}

function formatDate(dateTimeString) {
  return new Date(dateTimeString).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London"
  });
}

// Sort a list of events by time
function byTime(a, b) {
  const aTime = formatTime(a.start.dateTime); // Format to same time zone
  const bTime = formatTime(b.start.dateTime);

  // Get hours
  if (parseInt(aTime.split(":")[0]) < parseInt(bTime.split(":")[0])) {
    return -1;
  }
  if (parseInt(aTime.split(":")[0]) > parseInt(bTime.split(":")[0])) {
    return 1;
  }

  // If same hour, get minutes
  if (parseInt(aTime.split(":")[1]) < parseInt(bTime.split(":")[1])) {
    return -1;
  }
  if (parseInt(aTime.split(":")[1]) > parseInt(bTime.split(":")[1])) {
    return 1;
  }
  return 0;
}

// Check if a room has a specified feature
function hasFeatures(room, features) {
  var result = true;
  if (features.length === 0) {
    return result;
  }
  if (room.featureInstances !== undefined) {
    features.forEach(feature => {
      result =
        result &&
        room.featureInstances
          .map(instance => {
            return instance.feature.name;
          })
          .includes(feature);
    });
  } else {
    result = false;
  }

  return result;
}

// Check if a room has a certain capacity
function hasCapacity(room, capacity) {
  if (capacity !== "") {
    return room.capacity >= capacity;
  }

  return true;
}

// Check if a room is on a floor
function isOnFloor(room, floor) {
  if (floor !== "") {
    if (room.floorName === floor) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
}

// Get the range of an array of numbers
function rangeOf(arr) {
  return Math.max(...arr) - Math.min(...arr);
}

function vr(room, option) {
  if (option) {
    return room === "7.1" ? agent.add("<https://my.matterport.com/show/?m=fBscGfRt5in|Wanna see something cool?>") : "";
  } else {
    return `\n${room === "7.1" ? "<https://my.matterport.com/show/?m=fBscGfRt5in|Wanna see something cool?>" : ""}`;
  }
}

// For filtering rooms based on availability times
function emailFilter(status, dateTimeStart, busy) {
  switch (status) {
    case 0:
      return true;
    case 1:
      if (busy.length === 0) {
        return true;
      } else {
        if (new Date(dateTimeStart).getHours() < new Date(busy[0].start).getHours()) {
          return true;
        } else {
          return false;
        }
      }
      break;
    case 2:
      if (busy.length > 0) {
        if (new Date(dateTimeStart).getHours() < new Date(busy[0].start).getHours()) {
          return false;
        } else {
          return true;
        }
      } else {
        return false;
      }
      break;
    default:
      return true;
  }
}

// Make it pretty
function formatRoomFeatures(room) {
  var featuresArray = [];
  if (room.featureInstances !== undefined) {
    featuresArray = room.featureInstances.map(instance => {
      return instance.feature.name;
    });
  }
  var features = "";
  featuresArray.forEach(feature => {
    features = features + feature + "  ・  ";
  });
  features = features.slice(0, features.length - 5);
  if (features.length === 0) {
    features = "-";
  }

  return features;
}

// Make it pretty part 2
function searchRoomsBlocks(rooms, calendars, date, dateTimeStart, queryType) {
  var blocks = [];

  rooms.forEach(room => {
    const calendarsSorted = calendars[room.resourceEmail];
    const name = room.userVisibleDescription;
    const floor = room.floorName;
    const section = room.floorSection;
    const capacity = room.capacity;
    const features = formatRoomFeatures(room);

    var status;
    if (calendarsSorted.length === 0) {
      if (queryType) {
        status = `_Available at ${formatTime(dateTimeStart)}_`;
      } else {
        status = `_Available_`;
      }
    } else {
      if (queryType) {
        if (dateTimeStart < new Date(calendarsSorted[0].start)) {
          status = `_Available at ${formatTime(dateTimeStart)}_\n_Booked at_`;
        } else {
          status = "_Booked at_";
        }
      } else {
        if (date < new Date(calendarsSorted[0].start)) {
          status = `_Available now_\n_Booked at_`;
        } else {
          status = "_Booked at_";
        }
      }
    }

    const block = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${name}*\n${status}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Capacity: ${capacity}\n${features}`
          }
        ]
      },
      { type: "divider" }
    ];

    calendarsSorted.forEach(event => {
      block[0].text.text = block[0].text.text + `\n*${formatTime(event.start)} to ${formatTime(event.end)}*`;
    });

    blocks = blocks.concat(block);
  });

  return blocks;
}

// Make it pretty part 3
function yesNoBlock(title, value1, value2) {
  const block = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*` },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Yes"
        },
        value: value1
      }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: " " },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "No"
        },
        value: value2
      }
    }
  ];

  return block;
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log("Dialogflow Request headers: " + JSON.stringify(request.headers));
  console.log("Dialogflow Request body: " + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Hello! I'm Gray's Inn Road's meeting room assistant.\nHow can I help?`);
    agent.add(new Suggestion(`What can you do?`));
  }

  function fallback(agent) {
    agent.add(`Oops! Somebody messed up!\nIt was probably me, not you, so don't worry!\nCould you please try again?`);
  }

  function searchRooms(agent) {
    var status = parseInt(agent.parameters["room-status"]); // 0: all; 1: free; 2: busy
    var date = agent.parameters.date.split("T")[0];
    var time = agent.parameters.time.split("T")[1];
    var timePeriod = agent.parameters["time-period"];
    var features = agent.parameters.feature;
    var number = agent.parameters.number;
    var floor = agent.parameters.floor;

    const dt = dateTimeInterpreter(date, time, timePeriod);
    date = dt.date;
    const dateTimeStart = dt.dateTimeStart;
    const dateTimeEnd = dt.dateTimeEnd;
    const queryType = dt.queryType;

    if (isNaN(status)) {
      status = 0; // Default all rooms
    }

    return getRooms(OFFICE_ID)
      .then(rooms => {
        var allRooms = rooms.data.items;
        var allEmails = allRooms.map(room => {
          return { id: room.resourceEmail };
        });
        var calendars = {};
        return calFreebusy(dateTimeStart.toISOString(), dateTimeEnd.toISOString(), allEmails.slice(0, 25)) // Have to slice because too many resources...
          .then(bookings => {
            const resourceEmails = Object.keys(bookings.data.calendars).filter(email => {
              return emailFilter(status, dateTimeStart, bookings.data.calendars[email].busy);
            });
            resourceEmails.forEach(email => {
              calendars[email] = bookings.data.calendars[email].busy;
            });

            return calFreebusy(dateTimeStart.toISOString(), dateTimeEnd.toISOString(), allEmails.slice(25))
              .then(bookings => {
                const resourceEmails = Object.keys(bookings.data.calendars).filter(email => {
                  return emailFilter(status, dateTimeStart, bookings.data.calendars[email].busy);
                });
                resourceEmails.forEach(email => {
                  calendars[email] = bookings.data.calendars[email].busy;
                });

                var filteredRooms;
                filteredRooms = allRooms.filter(room => {
                  return (
                    Object.keys(calendars).includes(room.resourceEmail) &&
                    hasFeatures(room, features) &&
                    hasCapacity(room, number) &&
                    isOnFloor(room, floor)
                  );
                });

                var titleText;
                switch (status) {
                  case 0:
                    if (features.length === 0 && number === "") {
                      titleText = `Here are all meeting rooms.`;
                    } else {
                      titleText = `There are *${filteredRooms.length}* rooms that meet your requirements`;
                    }
                    break;
                  case 1:
                    titleText = `There are *${filteredRooms.length}* rooms that are available.`;
                    break;
                  case 2:
                    titleText = `There are *${filteredRooms.length}* rooms that are booked.`;
                    break;
                  default:
                    return true;
                }

                var payload = {
                  attachments: [
                    {
                      fallback: titleText,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: titleText
                          }
                        },
                        { type: "divider" }
                      ]
                    }
                  ]
                };
                const blocks = searchRoomsBlocks(filteredRooms, calendars, date, dateTimeStart, queryType);

                if (filteredRooms.length < 6) {
                  // Because Slack only supports up to 20 attachments...
                  payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks);
                } else {
                  payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks.slice(0, 15));
                  payload.attachments[0].blocks = payload.attachments[0].blocks.concat(
                    yesNoBlock("Would you like me to show you more rooms?", "Yes", "No")
                  );
                  agent.setContext({
                    name: "searchrooms-followup",
                    lifespan: 10,
                    parameters: {
                      rooms: filteredRooms.slice(5),
                      calendars: calendars,
                      date: date,
                      dateTimeStart: dateTimeStart,
                      queryType: queryType
                    }
                  });
                }
                agent.add(new Payload(agent.SLACK, payload));
              })
              .catch(err => {
                console.log(err);
                agent.add(ERROR_MSG);
              });
          })
          .catch(err => {
            console.log(err);
            agent.add(ERROR_MSG);
          });
      })
      .catch(err => {
        console.log(err);
        console.log(`Failed to get rooms`);
        agent.add(ERROR_MSG);
      });
  }

  function searchRoomsFollowupYes(agent) {
    const context = agent.getContext("searchrooms-followup");
    const calendars = context.parameters.calendars;
    const date = context.parameters.date;
    const dateTimeStart = context.parameters.dateTimeStart;
    const queryType = context.parameters.queryType;
    var filteredRooms = context.parameters.rooms;

    var payload = {
      attachments: [
        {
          fallback: "Here are some more rooms.",
          blocks: [{ type: "divider" }]
        }
      ]
    };

    const blocks = searchRoomsBlocks(filteredRooms, calendars, date, dateTimeStart, queryType);

    if (filteredRooms.length < 5) {
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks);
      agent.setContext({ name: "searchrooms-followup", lifespan: 0 });
    } else {
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks.slice(0, 15));
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(yesNoBlock("Would you like me to show you more rooms?", "Yes", "No"));
      agent.setContext({
        name: "searchrooms-followup",
        parameters: { rooms: filteredRooms.slice(5), calendars: calendars, queryType: queryType }
      });
    }

    agent.add(new Payload(agent.SLACK, payload));
  }

  function roomStatus(agent) {
    var room = agent.parameters.room;
    var date = agent.parameters.date.split("T")[0];
    var time = agent.parameters.time.split("T")[1];
    var timePeriod = agent.parameters["time-period"];

    const dt = dateTimeInterpreter(date, time, timePeriod);
    date = dt.date;
    const dateTimeStart = dt.dateTimeStart;
    const dateTimeEnd = dt.dateTimeEnd;
    const queryType = dt.queryType;

    if (!room) {
      agent.add(INVALID_ROOM_MSG);
    } else {
      return getRooms(OFFICE_ID)
        .then(rooms => {
          var roomInfo = rooms.data.items.filter(item => {
            return item.resourceName == room;
          })[0];

          return calEventsList(roomInfo.resourceEmail, dateTimeStart.toISOString(), dateTimeEnd.toISOString())
            .then(res => {
              var unique = [];
              var events = [];
              res.data.items
                .filter(item => {
                  return item.status === "confirmed";
                })
                .forEach(item => {
                  if (!unique.includes(item.summary)) {
                    unique.push(item.summary); // Discount duplicates
                    events.push(item);
                  }
                });
              events.sort(byTime);

              if (events.length > 0) {
                if (queryType) {
                  if (parseInt(formatTime(dateTimeStart).split(":")[0]) < parseInt(formatTime(events[0].start.dateTime).split(":")[0])) {
                    agent.add(`It looks like ${roomInfo.userVisibleDescription} is free until ${formatTime(events[0].start.dateTime)}!`);
                    vr(roomInfo.resourceName, 1);
                    // agent.add(new Suggestion(`Book ${roomInfo.userVisibleDescription}`));
                  } else {
                    const event = events[0];
                    var timeText;
                    var titleText;
                    if (agent.query.includes("now")) {
                      timeText = `until ${formatTime(event.end.dateTime)}`;
                      titleText = `The meeting _${event.summary}_ is in progress in ${
                        roomInfo.userVisibleDescription
                      } ${timeText}, booked by ${nameFromEmail(event.organizer.email)}.`;
                    } else {
                      timeText = `${formatTime(event.start.dateTime)} to ${formatTime(event.end.dateTime)}`;
                      titleText = `${roomInfo.userVisibleDescription} has been booked from ${timeText} by ${nameFromEmail(event.organizer.email)}`;
                    }
                    var payload = {
                      attachments: [
                        {
                          color: RED,
                          fallback: titleText,
                          blocks: [
                            {
                              type: "section",
                              text: {
                                type: "mrkdwn",
                                text: titleText + vr(roomInfo.resourceName, 0)
                              }
                            },
                            { type: "divider" },
                            {
                              type: "section",
                              text: {
                                type: "mrkdwn",
                                text: `*${event.summary}* ・ ${timeText}`
                              }
                            },
                            {
                              type: "context",
                              elements: [
                                {
                                  type: "mrkdwn",
                                  text: `organised by ${nameFromEmail(event.organizer.email)}`
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    };
                    agent.add(new Payload(agent.SLACK, payload));
                  }
                } else {
                  var payload = {
                    attachments: [
                      {
                        fallback: `It looks like ${roomInfo.userVisibleDescription} is booked at these times:`,
                        blocks: [
                          {
                            type: "section",
                            text: {
                              type: "mrkdwn",
                              text: `It looks like ${roomInfo.userVisibleDescription} is booked at these times:` + vr(roomInfo.resourceName, 0)
                            }
                          },
                          { type: "divider" },
                          {
                            type: "section",
                            text: {
                              type: "mrkdwn",
                              text: `*${roomInfo.userVisibleDescription}* ・ ${formatDate(date)}\n_Bookings_`
                            }
                          }
                        ]
                      }
                    ]
                  };
                  events.slice(0, 10).forEach(event => {
                    // Slack message API limitations
                    const block = [
                      {
                        type: "section",
                        text: {
                          type: "mrkdwn",
                          text: `*${formatTime(event.start.dateTime)} to ${formatTime(event.end.dateTime)}*`
                        }
                      },
                      {
                        type: "context",
                        elements: [
                          {
                            type: "mrkdwn",
                            text: `*${event.summary}*\norganised by ${nameFromEmail(event.organizer.email)}`
                          }
                        ]
                      },
                      {
                        type: "section",
                        text: {
                          type: "plain_text",
                          text: " "
                        }
                      }
                    ];
                    payload.attachments[0].blocks = payload.attachments[0].blocks.concat(block);
                  });
                  agent.add(new Payload(agent.SLACK, payload));
                }
              } else {
                if (queryType) {
                  var payload = {
                    attachments: [
                      {
                        color: GREEN,
                        fallback: `It looks like ${roomInfo.userVisibleDescription} is free at ${formatTime(dateTimeStart)}!`,
                        blocks: [
                          {
                            type: "section",
                            text: {
                              type: "mrkdwn",
                              text:
                                `It looks like ${roomInfo.userVisibleDescription} is free at ${formatTime(dateTimeStart)}!` +
                                vr(roomInfo.resourceName, 0)
                            }
                          }
                        ]
                      }
                    ]
                  };
                  // payload.attachments[0].blocks = payload.attachments[0].blocks.concat(
                  //   yesNoBlock(
                  //     `Would you like to book ${roomInfo.userVisibleDescription} at ${timeToString(dateTimeStart)}?`,
                  //     `Book room ${roomInfo.resourceName} on ${dateToString(new Date(Date.parse(date)))} at ${timeToString(dateTimeStart)}`,
                  //     `No`
                  //   )
                  // );
                  agent.add(new Payload(agent.SLACK, payload));
                } else {
                  agent.add(`There are currently no bookings for ${roomInfo.userVisibleDescription} on ${formatDate(date)}.`);
                  vr(roomInfo.resourceName, 1);
                  // agent.add(new Suggestion(`Book room ${roomInfo.resourceName}`));
                  // agent.add(new Suggestion("No"));
                }
                // agent.add(new Suggestion("Does it have a phone?"));
                // agent.add(new Suggestion("Does it have a TV?"));
                // agent.add(new Suggestion("How many people can it fit?"));
              }
              agent.setContext({
                name: "roomstatus-followup",
                lifespan: 3,
                parameters: { roomInQuestion: roomInfo.resourceName }
              });
            })
            .catch(err => {
              console.log(err);
              agent.add(ERROR_MSG);
            });
        })
        .catch(err => {
          console.log(err);
          console.log(`Failed to get rooms`);
          agent.add(ERROR_MSG);
        });
    }
  }

  function roomFeature(agent) {
    const context = agent.getContext("roomstatus-followup");
    const features = agent.parameters.feature;
    var room = agent.parameters.room;

    if (context && !room) {
      // If there is context and a room is not specified
      room = context.parameters.roomInQuestion;
    }

    if (!room) {
      agent.add(INVALID_ROOM_MSG);
    } else {
      return getRooms(OFFICE_ID)
        .then(rooms => {
          var roomInfo = rooms.data.items.filter(item => {
            return item.resourceName == room;
          })[0];

          var titleText;

          if (hasFeatures(roomInfo, features)) {
            if (features.length === 0) {
              titleText = `*${roomInfo.userVisibleDescription}* has the following:`;
            } else {
              titleText = `Yes, *${roomInfo.userVisibleDescription}* has the following:`;
            }
          } else {
            titleText = `No, *${roomInfo.userVisibleDescription}* only has the following:`;
          }

          var payload = {
            attachments: [
              {
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: titleText + vr(roomInfo.resourceName, 0)
                    }
                  }
                ]
              }
            ]
          };

          if (roomInfo.featureInstances !== undefined) {
            roomInfo.featureInstances.forEach(instance => {
              const block = [
                {
                  type: "context",
                  elements: [
                    {
                      type: "image",
                      image_url: ICONS[instance.feature.name],
                      alt_text: "icon"
                    },
                    {
                      type: "mrkdwn",
                      text: `*${instance.feature.name}*`
                    }
                  ]
                }
              ];
              payload.attachments[0].blocks = payload.attachments[0].blocks.concat(block);
            });
          } else {
            const block = [
              {
                type: "context",
                elements: [{ type: "plain_text", text: "None" }]
              }
            ];
            payload.attachments[0].blocks = payload.attachments[0].blocks.concat(block);
          }

          agent.add(new Payload(agent.SLACK, payload));
        })
        .catch(err => {
          console.log(err);
        });
    }
  }

  function roomCapacity(agent) {
    const context = agent.getContext("roomstatus-followup");
    const number = agent.parameters.number;
    var room = agent.parameters.room;

    if (context && !room) {
      room = context.parameters.roomInQuestion;
    }

    if (!room) {
      agent.add(INVALID_ROOM_MSG);
    } else {
      return getRooms(OFFICE_ID)
        .then(rooms => {
          var roomInfo = rooms.data.items.filter(item => {
            return item.resourceName == room;
          })[0];

          var titleText;
          if (number === "") {
            titleText = `*${roomInfo.userVisibleDescription}* can seat ${roomInfo.capacity} people.`;
          } else {
            if (hasCapacity(roomInfo, number)) {
              titleText = `Yep, it looks like you can fit ${number} people into *${roomInfo.userVisibleDescription}*.`;
            } else {
              titleText = `Sorry, but *${roomInfo.userVisibleDescription}* can only seat ${roomInfo.capacity} people.`;
            }
          }
          var payload = {
            attachments: [
              {
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text:
                        titleText +
                        `\n${roomInfo.resourceName === "7.1" ? "<https://my.matterport.com/show/?m=fBscGfRt5in|Wanna see something cool?>" : ""}`
                    }
                  },
                  {
                    type: "context",
                    elements: [
                      {
                        type: "image",
                        image_url: ICONS.conference,
                        alt_text: "icon"
                      },
                      {
                        type: "mrkdwn",
                        text: `*${roomInfo.capacity}*`
                      }
                    ]
                  }
                ]
              }
            ]
          };

          agent.add(new Payload(agent.SLACK, payload));
        })
        .catch(err => {
          console.log(err);
          agent.add(ERROR_MSG);
        });
    }
  }

  function bookRoom(agent) {
    agent.setContext({ name: "roomstatus-followup", lifespan: 0 });
    if (agent.parameters.title && !agent.parameters.room && !agent.parameters.date && !agent.parameters.time && !agent.parameters.duration) {
      agent.setFollowupEvent("fallback");
    } else {
      agent.add("Sorry, this feature is still under development and is not available at the moment.");
    }
    // agent.setContext({
    //   name: "bookroom-dog",
    //   lifespan: 1,
    //   parameters: { message: "Sorry, this feature still in testing and is not available at the moment.\nHere's a GIF of a dog instead." }
    // });
    // agent.setFollowupEvent("dog");
  }

  function bookRoomFollowupYes(agent) {
    const context = agent.getContext("bookroom-followup");
    const resource = context.parameters.resource;
    return calEventsInsert(adminId, resource)
      .then(() => {
        const payload = {
          attachments: [
            {
              color: GREEN,
              fallback: "Done! Your meeting has been booked!",
              blocks: [
                { type: "divider" },
                {
                  type: "context",
                  elements: [
                    {
                      type: "image",
                      image_url: ICONS.cal_green,
                      alt_text: "icon"
                    },
                    { type: "mrkdwn", text: `*Done! Your meeting has been booked!*` }
                  ]
                }
              ]
            }
          ]
        };
        agent.add(new Payload(agent.SLACK, payload));
      })
      .catch(err => {
        console.log(err);
      });
  }

  function roomOccupancy(agent) {
    const context = agent.getContext("roomstatus-followup");
    var room = agent.parameters.room;
    var time = agent.parameters.time.split("T")[1];
    var date;
    const todate = new Date();

    if (!time || agent.query.includes("now")) {
      time = new Date(todate.setMinutes(todate.getMinutes() - 15)).toISOString().split("T")[1]; // Default to 15 minutes ago
    }

    const datetime = new Date(todate.toISOString().split("T")[0] + "T" + time)
      .toISOString()
      .split(".")[0]
      .split("T"); // Corrected datetime to offset +00:00
    date = datetime[0];
    time = datetime[1];

    if (context && room === "") {
      room = context.parameters.roomInQuestion;
    }

    if (room === "") {
      agent.add(INVALID_ROOM_MSG);
    } else {
      const query = "SELECT * FROM `roombot-oknmqj.sensors.data` WHERE date = " + `\"${date}\"` + " AND time > " + `\"${time}\"`;
      const options = { query: query, location: "US" };
      return BigQueryClient.query(options)
        .then(res => {
          console.log(res[0]);
          const data = res[0];
          const tempData = data.map(item => {
            return parseInt(item.temperature);
          });
          const humData = data.map(item => {
            return parseInt(item.humidity);
          });
          const motData = data.map(item => {
            return parseInt(item.motion);
          });
          console.log(tempData);
          console.log(humData);
          console.log(motData);

          const tempRange = rangeOf(tempData);
          const humRange = rangeOf(humData);
          const motionDetected = motData.filter(val => val === 1).length;

          console.log(tempRange, humRange, motionDetected);

          if ((tempRange > 2 && humRange > 5 && motionDetected > 3) || humRange > 10 || motionDetected > 20) {
            agent.add("I think there might be someone in there.");
          } else {
            agent.add("There doesn't appear to be anyone there.");
          }
        })
        .catch(err => {
          console.log(err);
        });
    }
  }

  function github(agent) {
    if (agent.query.includes("version")) {
      agent.add(`My version number is _${VERSION}_ released on _${RELEASE_DATE}_.`);
    }
    agent.add("Read more about me on my GitHub page: https://github.com/ralfmy/itv-roombot");
  }

  function help(agent) {
    agent.add("Here are a few things you can ask me:");
    agent.add(new Suggestion("Find me available rooms"));
    agent.add(new Suggestion("Will 2.3 be free from 4-5pm?"));
    agent.add(new Suggestion("Is 7.7 available tomorrow?"));
    agent.add(new Suggestion("Who booked 4.4 today?"));
    agent.add(new Suggestion("Does room 5.1 have Hangouts?"));
    // agent.add(new Suggestion("Is there someone in 2.1?"));
    // agent.add(new Suggestion("Woof"));
  }

  function dog(agent) {
    const context = agent.getContext("bookroom-dog");
    var message = "Woof";
    if (context) {
      message = context.parameters.message;
    }
    return dogAPI()
      .then(res => {
        const url = JSON.parse(res.body).data.fixed_height_small_url;
        const payload = {
          attachments: [
            {
              fallback: "Woof",
              text: message,
              image_url: url
            }
          ]
        };
        agent.add(new Payload(agent.SLACK, payload));
      })
      .catch(err => {
        console.log(err);
      });
  }

  let intentMap = new Map();
  intentMap.set("Default Welcome Intent", welcome);
  intentMap.set("Default Fallback Intent", fallback);
  intentMap.set(SEARCH_ROOMS_INTENT, searchRooms);
  intentMap.set(SEARCH_ROOMS_FOLLOWUP_INTENT, searchRoomsFollowupYes);
  intentMap.set(ROOM_STATUS_INTENT, roomStatus);
  intentMap.set(ROOM_FEATURE_INTENT, roomFeature);
  intentMap.set(ROOM_CAPACITY_INTENT, roomCapacity);
  intentMap.set(ROOM_OCCUPANCY_INTENT, roomOccupancy);
  intentMap.set(BOOK_ROOM_INTENT, bookRoom);
  intentMap.set(BOOK_ROOM_FOLLOWUP_INTENT, bookRoomFollowupYes);
  intentMap.set(GITHUB_INTENT, github);
  intentMap.set(HELP_INTENT, help);
  intentMap.set(DOG_INTENT, dog);
  agent.handleRequest(intentMap);
});
