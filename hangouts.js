"use strict";

/* REQUIREMENTS */
const functions = require("firebase-functions");
const { google } = require("googleapis");
const { WebhookClient } = require("dialogflow-fulfillment");
const { Text, Card, Payload, Suggestion } = require("dialogflow-fulfillment");
const { BasicCard, List, Suggestions, Image, Permission, SignIn } = require("actions-on-google");
const bigquery = require("@google-cloud/bigquery");
const request = require("request-promise-native"); // For third-party HTTP requests

/* APIs */
const calendar = google.calendar("v3");
const admin = google.admin("directory_v1");

/* ADMIN */
const adminId = process.env.ADMIN_ID;
const custId = process.env.CUST_ID;

/* SERVICE ACCOUNT */
const serviceAccountAuth = new google.auth.JWT(
  process.env.SA_CLIENT_EMAIL,
  null,
  process.env.SA_PRIVATE_KEY.replace(/\\n/g, "\n"),
  [
    "https://www.googleapis.com/auth/calendar",
    // "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/admin.directory.resource.calendar"
    // "https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly"
  ],
  adminId
);

/* BIGQUERY CLIENT */
const BigQueryClient = new bigquery({ project_id: "roombot-oknmqj" });

/* INTENT CONSTANTS */
const SEARCH_ROOMS_INTENT = "Search Rooms";
const SEARCH_ROOMS_FOLLOWUP_INTENT = "Search Rooms - yes";
const ROOM_STATUS_INTENT = "Room Status";
const ROOM_STATUS_FOLLOWUP_INTENT = "Room Status - yes";
const ROOM_FEATURE_INTENT = "Room Feature";
const ROOM_CAPACITY_INTENT = "Room Capacity";
const ROOM_OCCUPANCY_INTENT = "Room Occupancy";
const BOOK_ROOM_INTENT = "Book Room";
const BOOK_ROOM_FOLLOWUP_INTENT = "Book Room - yes";
const BOOK_ROOM_PERMISSION_HELPER = "Book Room Permission";
const HELP_INTENT = "Help";
const DOG_INTENT = "Dog";

/* APPLICATION CONSTANTS */
const ERROR_MSG = "Oops! Looks like my developer messed up somewhere! Apologies on his behalf!";
const INVALID_ROOM_MSG = "I'm sorry, but I can't seem to find that room.  \nCould you please try again?";

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
  cal_sched: "https://img.icons8.com/color/48/000000/overtime.png",
  cube: "https://img.icons8.com/color/48/000000/orthogonal-view.png"
};

const IMAGES = {
  desk: "https://www.mayastepien.nl/googlecalendar/mayastepien_habits_code.jpg",
  archery: "https://www.mayastepien.nl/googlecalendar/mayastepien-google-archery.jpg",
  breakfast: "https://www.mayastepien.nl/googlecalendar/mayastepien-google-breakfast.jpg",
  jumping: "https://www.mayastepien.nl/googlecalendar/mayastepien-google-jumping.jpg",
  art: "https://www.mayastepien.nl/googlecalendar/mayastepien_habits_art.jpg"
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

/* DOG */
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

  if (date === "") {
    // If no date is supplied, assume today's date
    date = new Date();
    date = date.toISOString().split("T")[0];
  }

  if (timePeriod === "" && time) {
    // "...now"; "...3pm"
    dateTimeStart = new Date(Date.parse(date + "T" + time));
    dateTimeEnd = new Date(date + "T23:59:59" + TIME_ZONE_OFFSET);
  } else if (timePeriod === "" && !time) {
    // "...today"; "...tomorrow"; "...later"
    dateTimeStart = new Date(Date.parse(date + "T00:00:00" + TIME_ZONE_OFFSET));
    dateTimeEnd = new Date(Date.parse(date + "T23:59:59" + TIME_ZONE_OFFSET));
    queryType = 0;
  } else {
    // "...from 3-4pm"
    timeStart = timePeriod.startTime.split("T")[1];
    timeEnd = timePeriod.endTime.split("T")[1];
    dateTimeStart = new Date(Date.parse(date + "T" + timeStart));
    dateTimeEnd = new Date(Date.parse(date + "T" + timeEnd));
  }

  return { date: date, timeStart: timeStart, timeEnd: timeEnd, dateTimeStart: dateTimeStart, dateTimeEnd: dateTimeEnd, queryType: queryType };
}

function nameFromEmail(email) {
  var name = email.split("@")[0];
  var first = name.split(".")[0];
  var last = name.split(".")[1];
  first = first[0].toUpperCase() + first.slice(1);
  last = last[0].toUpperCase() + last.slice(1);
  return first + " " + last;
}

function timeToString(time) {
  return time.toLocaleString("en-GB", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "Europe/London"
  });
}

function dateToString(date) {
  return date.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
}

function emailFilter(status, date, dateTimeStart, busy, queryType) {
  var busyDate;
  var busyStartTime;
  switch (status) {
    case 0:
      return true;
    case 1:
      if (busy.length === 0) {
        return true;
      } else {
        if (queryType) {
          busyDate = dateToString(new Date(Date.parse(date)));
          busyStartTime = new Date(Date.parse(busy[0].start));
          if (dateTimeStart < busyStartTime) {
            return true;
          } else {
            return false;
          }
        } else {
          return true;
        }
      }
      break;
    case 2:
      if (busy.length > 0) {
        if (queryType) {
          busyDate = dateToString(new Date(Date.parse(date)));
          busyStartTime = new Date(Date.parse(busy[0].start));
          if (dateTimeStart < busyStartTime) {
            return false;
          } else {
            return true;
          }
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

function byTime(a, b) {
  const aDateTime = new Date(Date.parse(a.start.dateTime));
  const bDateTime = new Date(Date.parse(b.start.dateTime));
  if (aDateTime.getHours() < bDateTime.getHours()) {
    return -1;
  } else if (aDateTime.getHours() > bDateTime.getHours()) {
    return 1;
  } else {
    if (aDateTime.getMinutes() < bDateTime.getMinutes()) {
      return -1;
    } else {
      return 1;
    }
  }
}

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

function hasCapacity(room, capacity) {
  if (capacity !== "") {
    return room.capacity >= capacity;
  }

  return true;
}

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

function rangeOf(arr) {
  return Math.max(...arr) - Math.min(...arr);
}

function searchRoomsListItems(rooms, calendars, dateTimeStart, queryType) {
  var items = {};

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
        status = `Available at ${timeToString(new Date(dateTimeStart))}`;
      } else {
        status = `Available`;
      }
    } else {
      if (queryType) {
        if (dateTimeStart < new Date(Date.parse(calendarsSorted[0].start))) {
          status = `Available at ${timeToString(new Date(dateTimeStart))}`;
        } else {
          status = "Booked";
        }
      } else {
        if (dateTimeStart < new Date(Date.parse(calendarsSorted[0].start))) {
          status = `Available now`;
        } else {
          status = "Booked";
        }
      }
    }

    const item = { title: `${name} ・ ${status}`, description: `Capacity: ${capacity}  \n${features}` };
    items[`${room.resourceName}`] = item;
  });

  return items;
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log("Dialogflow Request headers: " + JSON.stringify(request.headers));
  console.log("Dialogflow Request body: " + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Hello! I'm Gray's Inn Road's meeting room assistant.\nHow can I help?`);
    // agent.add(new Suggestion(`What can you do?`));
  }

  function fallback(agent) {
    agent.add(`Oops! Somebody messed up!\nIt was probably me, not you, so don't worry!\nCould you please try again?`);
  }

  function searchRooms(agent) {
    var status = parseInt(agent.parameters["room-status"]);
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
      status = 0;
    }

    return getRooms(OFFICE_ID)
      .then(rooms => {
        var allRooms = rooms.data.items;
        var allEmails = allRooms.map(room => {
          return {
            id: room.resourceEmail
          };
        });
        var calendars = {};

        return calFreebusy(dateTimeStart.toISOString(), dateTimeEnd.toISOString(), allEmails.slice(0, 25)) // Have to slice because too many resources...
          .then(bookings => {
            const resourceEmails = Object.keys(bookings.data.calendars).filter(email => {
              return emailFilter(status, date, dateTimeStart, bookings.data.calendars[email].busy, queryType);
            });
            resourceEmails.forEach(email => {
              calendars[email] = bookings.data.calendars[email].busy;
            });

            return calFreebusy(dateTimeStart.toISOString(), dateTimeEnd.toISOString(), allEmails.slice(25))
              .then(bookings => {
                const resourceEmails = Object.keys(bookings.data.calendars).filter(email => {
                  return emailFilter(status, date, dateTimeStart, bookings.data.calendars[email].busy, queryType);
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

                agent.add(titleText);

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
                        {
                          type: "divider"
                        }
                      ]
                    }
                  ]
                };

                filteredRooms.forEach(room => {
                  const calendarsSorted = calendars[room.resourceEmail];
                  const name = room.userVisibleDescription;
                  const floor = room.floorName;
                  const section = room.floorSection;
                  const capacity = room.capacity;
                  const features = formatRoomFeatures(room);

                  var status;
                  if (calendarsSorted.length === 0) {
                    if (queryType) {
                      status = `Available at ${timeToString(new Date(dateTimeStart))}`;
                    } else {
                      status = `Available`;
                    }
                  } else {
                    if (queryType) {
                      if (dateTimeStart < new Date(Date.parse(calendarsSorted[0].start))) {
                        status = `Available at ${timeToString(new Date(dateTimeStart))}`;
                      } else {
                        status = "Booked";
                      }
                    } else {
                      if (dateTimeStart < new Date(Date.parse(calendarsSorted[0].start))) {
                        status = `Available now`;
                      } else {
                        status = "Booked";
                      }
                    }
                  }
                  agent.add(`\n\n*${name}* ・ _${status}_\nCapacity: ${capacity}  \n${features}`);
                });
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
    const context = agent.context.get("searchrooms-followup");
    const calendars = context.parameters.calendars;
    const dateTimeStart = context.parameters.dateTimeStart;
    const queryType = context.parameters.queryType;
    var filteredRooms = context.parameters.rooms;

    var payload = {
      attachments: [
        {
          fallback: "Here's some more rooms.",
          blocks: [
            {
              type: "divider"
            }
          ]
        }
      ]
    };

    const blocks = searchRoomsBlocks(filteredRooms, calendars, dateTimeStart, queryType);

    if (filteredRooms.length < 5) {
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks);
      agent.context.set({
        name: "searchrooms-followup",
        lifespan: 0
      });
    } else {
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(blocks.slice(0, 15));
      payload.attachments[0].blocks = payload.attachments[0].blocks.concat(yesNoBlock("Would you like me to show you more rooms?", "Yes", "No"));
      agent.context.set({
        name: "searchrooms-followup",
        parameters: {
          rooms: filteredRooms.slice(5),
          calendars: calendars,
          queryType: queryType
        }
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
              var events = res.data.items
                .filter(event => {
                  return event.status === "confirmed";
                })
                .sort(byTime);
              console.log(events);
              if (events.length > 0) {
                if (queryType) {
                  if (dateTimeStart.getHours() < new Date(Date.parse(events[0].start.dateTime)).getHours()) {
                    agent.add(
                      `It looks like *${roomInfo.userVisibleDescription}* is free until ${timeToString(
                        new Date(Date.parse(events[0].start.dateTime))
                      )}!`
                    );
                    // agent.add(new Suggestion(`Book ${roomInfo.userVisibleDescription}`));
                  } else {
                    const event = events[0];
                    var timeText;
                    var titleText;

                    if (agent.query.includes("now")) {
                      timeText = `until ${timeToString(new Date(Date.parse(event.end.dateTime)))}`;
                      titleText = `The meeting _${event.summary}_ is in progress in *${
                        roomInfo.userVisibleDescription
                      }* ${timeText}, booked by ${nameFromEmail(event.organizer.email)}.`;
                    } else {
                      timeText = `${timeToString(new Date(Date.parse(event.start.dateTime)))} to ${timeToString(
                        new Date(Date.parse(event.end.dateTime))
                      )}`;
                      titleText = `*${roomInfo.userVisibleDescription}* has been booked from ${timeText} by ${nameFromEmail(event.organizer.email)}`;
                    }
                    agent.add(titleText);
                  }
                } else {
                  agent.add(`It looks like *${roomInfo.userVisibleDescription}* is booked at these times:`);
                  events.forEach(event => {
                    agent.add(
                      `・\n*${timeToString(new Date(Date.parse(event.start.dateTime)))} to ${timeToString(
                        new Date(Date.parse(event.end.dateTime))
                      )}*\n_${event.summary}_\norganised by ${nameFromEmail(event.organizer.email)}`
                    );
                  });
                }
              } else {
                if (queryType) {
                  agent.add(`It looks like *${roomInfo.userVisibleDescription}* is free at ${timeToString(dateTimeStart)}!`);
                } else {
                  agent.add(
                    `There are currently no bookings for *${roomInfo.userVisibleDescription}* on ${dateToString(new Date(Date.parse(date)))}.`
                  );
                }
              }
              agent.context.set({
                name: "roomstatus-followup",
                lifespan: 7,
                parameters: {
                  roomInQuestion: roomInfo.resourceName,
                  dateInQuestion: date
                }
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
    const context = agent.context.get("roomstatus-followup");
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

          agent.add(titleText);

          if (roomInfo.featureInstances !== undefined) {
            roomInfo.featureInstances.forEach(instance => {
              agent.add(`・ ${instance.feature.name}`);
            });
          } else {
            agent.add("None");
          }
        })
        .catch(err => {
          console.log(err);
        });
    }
  }

  function roomCapacity(agent) {
    const context = agent.context.get("roomstatus-followup");
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
            titleText = `*${roomInfo.userVisibleDescription}* can seat *${roomInfo.capacity}* people.`;
          } else {
            if (hasCapacity(roomInfo, number)) {
              titleText = `Yep, it looks like you can just about squeeze *${number}* people into *${roomInfo.userVisibleDescription}*.`;
            } else {
              titleText = `Sorry, but *${roomInfo.userVisibleDescription}* can only seat *${roomInfo.capacity}* people.`;
            }
          }
          agent.add(titleText);
        })
        .catch(err => {
          console.log(err);
          agent.add(ERROR_MSG);
        });
    }
  }

  function bookRoom(agent) {
    const context = agent.context.get("roomstatus-followup");
    var room = agent.parameters.room;
    var date = agent.parameters.date;
    const time = agent.parameters.time;
    const duration = agent.parameters.duration;
    const title = agent.parameters.title;

    if (title && !room && !date && !time && !duration) {
      agent.setFollowupEvent("help");
      return null;
    }

    if (context && !room) {
      room = context.parameters.roomInQuestion;
    }

    if (context && date === "") {
      date = context.parameters.dateInQuestion;
    }

    if (!room) {
      agent.add("Which room would you like to book?");
    } else if (date === "") {
      agent.add("On which day?");
    } else if (!time) {
      agent.add("What time would you like to book this room for?");
    } else if (time && !duration) {
      agent.add("And for how long?");
    } else if (!title) {
      agent.add('What would you like to call this meeting?\nPlease surround the name in quotation marks, like "Meeting Name"');
    }

    if (room && date && time && duration && title) {
      var resource = {
        summary: title.replace(/\"/g, ""),
        end: {
          dateTime: ""
        },
        start: {
          dateTime: ""
        },
        creator: {
          email: ""
        },
        organizer: {
          email: ""
        },
        location: "",
        attendees: [],
        description: "booked by ITV Roombot",
        colorId: "3" // purple
      };
      return getRooms(OFFICE_ID).then(rooms => {
        var roomInfo = rooms.data.items.filter(item => {
          return item.resourceName == room;
        });

        if (roomInfo.length === 0) {
          agent.add(INVALID_ROOM_MSG);
        } else {
          roomInfo = roomInfo[0];
        }
        const profile = request.body.originalDetectIntentRequest.payload.event.user;
        resource.creator.email = profile.email;
        resource.organizer.email = profile.email;
        resource.attendees.push({
          email: profile.email,
          organizer: true,
          responseStatus: "accepted"
        });
        resource.attendees.push({
          email: roomInfo.resourceEmail,
          displayName: roomInfo.generatedResourceName,
          self: true,
          resource: true,
          responseStatus: "accepted"
        });
        resource.location = roomInfo.generatedResourceName;
        resource.start.dateTime = new Date(Date.parse(date.split("T")[0] + "T" + time.split("T")[1])).toISOString();
        var timeAdjusted;
        switch (duration.unit) {
          case "min":
            timeAdjusted = new Date(new Date(time).setMinutes(new Date(time).getMinutes() + duration.amount));
            resource.end.dateTime = new Date(Date.parse(date.split("T")[0] + "T" + timeAdjusted.toISOString().split("T")[1])).toISOString();
            break;
          case "h":
            timeAdjusted = new Date(new Date(time).setHours(new Date(time).getHours() + duration.amount));
            resource.end.dateTime = new Date(Date.parse(date.split("T")[0] + "T" + timeAdjusted.toISOString().split("T")[1])).toISOString();
            break;
          default:
            break;
        }
        console.log(resource);
        return calFreebusy(resource.start.dateTime, resource.end.dateTime, [
          {
            id: roomInfo.resourceEmail
          }
        ]).then(bookings => {
          if (bookings.data.calendars[roomInfo.resourceEmail].busy.length > 0) {
            agent.add(`Sorry! Looks like someone has already booked ${roomInfo.userVisibleDescription}.`);
          } else {
            agent.add("Here's a summary of your booking:\n\n");
            agent.add(
              `*${resource.summary}* ・ ${dateToString(new Date(Date.parse(date)))} ・ ${timeToString(
                new Date(Date.parse(resource.start.dateTime))
              )} to ${timeToString(new Date(Date.parse(resource.end.dateTime)))}\n_${roomInfo.userVisibleDescription}_\norganised by ${
                profile.displayName
              }\n\n`
            );
            agent.add("Would you like to confirm the booking?");
            agent.context.set({
              name: "bookroom-followup",
              lifespan: 1,
              parameters: {
                resource: resource
              }
            });
          }
        });
      });
    }
  }

  function bookRoomFollowupYes(agent) {
    const context = agent.context.get("bookroom-followup");
    console.log(context);
    const resource = context.parameters.resource;
    return calEventsInsert(adminId, resource)
      .then(() => {
        agent.add("Done! Your meeting has been booked!");
      })
      .catch(err => {
        console.log(err);
      });
  }

  function roomOccupancy(agent) {
    const context = agent.context.get("roomstatus-followup");
    var room = agent.parameters.room;
    var time = agent.parameters.time.split("T")[1];
    var date;
    var todate = new Date();

    if (!time || agent.query.includes("now")) {
      time = new Date(todate.setMinutes(todate.getMinutes() - 15)).toISOString().split("T")[1];
    }

    const datetime = new Date(Date.parse(todate.toISOString().split("T")[0] + "T" + time))
      .toISOString()
      .split(".")[0]
      .split("T"); // Corrected datetime to offset +00:00
    date = datetime[0];
    time = datetime[1];
    todate = new Date();

    if (context && room === "") {
      room = context.parameters.roomInQuestion;
    }

    if (room === "") {
      agent.add(INVALID_ROOM_MSG);
    } else {
      return getRooms(OFFICE_ID)
        .then(rooms => {
          var roomInfo = rooms.data.items.filter(item => {
            return item.resourceName === room;
          });

          if (roomInfo.length === 0) {
            agent.add(INVALID_ROOM_MSG);
          } else {
            roomInfo = roomInfo[0];
          }

          const query =
            "SELECT * FROM `roombot-oknmqj.sensors.data` WHERE room = " +
            `\"${roomInfo.resourceName}\"` +
            " AND date = " +
            `\"${date}\"` +
            " AND time > " +
            `\"${time}\"`;
          const options = {
            query: query,
            location: "US"
          };
          return BigQueryClient.query(options)
            .then(res => {
              console.log(res[0]);
              const data = res[0];

              if (data.length > 0) {
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
                  agent.add(`I think there might be someone in ${roomInfo.userVisibleDescription}.`);
                } else {
                  agent.add(`There doesn't appear to be anyone in ${roomInfo.userVisibleDescription}.`);
                }
              } else {
                agent.add(`Sorry, I don't have any data for that room.`);
              }
            })
            .catch(err => {
              console.log(err);
            });
        })
        .catch(err => {
          console.log(err);
        });
    }
  }

  function help(agent) {
    agent.add("*Here are a few things you can ask me:*\n");
    agent.add("Find me available rooms");
    agent.add("Will 2.3 be free from 4-5pm?");
    agent.add("Is 7.7 available tomorrow?");
    agent.add("Who booked 4.4 today?");
  }

  function dog(agent) {
    const context = agent.context.get("bookroom-dog");
    var message = "Woof";
    console.log(context);
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
  intentMap.set(HELP_INTENT, help);
  intentMap.set(DOG_INTENT, dog);
  agent.handleRequest(intentMap);
});
