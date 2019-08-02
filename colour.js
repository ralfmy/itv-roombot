const functions = require("firebase-functions");
const { google } = require("googleapis");
const bigquery = require("@google-cloud/bigquery");

/* APIs */
const calendar = google.calendar("v3");
const admin = google.admin("directory_v1");

/* ADMIN */
const adminId = "ralf.yap@dev.itv.com";
const custId = "C03fv0qmc";

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

const TIME_ZONE_OFFSET = "+01:00";

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
  const today = new Date().toISOString().split("T")[0] + "T00:00:00" + TIME_ZONE_OFFSET;
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
    calendar.events.insert(
      {
        auth: serviceAccountAuth,
        calendarId: calendarId,
        resource: resource
      },
      (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log("EVENT CREATED");
          resolve(res);
        }
      }
    );
  });
}

// Update calendar event
function calEventsUpdate(calendarId, eventId, resource) {
  return new Promise((resolve, reject) => {
    calendar.events.update(
      {
        auth: serviceAccountAuth,
        calendarId: calendarId,
        eventId: eventId,
        resource: resource
      },
      (err, res) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log("EVENT UPDATED");
          resolve(res);
        }
      }
    );
  });
}

/* HELPER FUNCTIONS */
function byTime(a, b) {
  const aDateTime = new Date(Date.parse(a.start.dateTime));
  const bDateTime = new Date(Date.parse(b.start.dateTime));
  if (aDateTime.getHours() < bDateTime.getHours()) {
    return 1;
  } else if (aDateTime.getHours() > bDateTime.getHours()) {
    return -1;
  } else {
    if (aDateTime.getMinutes() < bDateTime.getMinutes()) {
      return 1;
    } else {
      return -1;
    }
  }
}

function rangeOf(arr) {
  return Math.max(...arr) - Math.min(...arr);
}

exports.colourCalendar = (event, context) => {
  const data = event.data ? JSON.parse(Buffer.from(event.data, "base64").toString()) : "Error: No data";

  console.log(data);

  const room = data.room;
  var todate = new Date();
  var date;
  var time = new Date(new Date().setMinutes(todate.getMinutes() - 15)).toISOString().split("T")[1];
  const datetime = new Date(Date.parse(todate.toISOString().split("T")[0] + "T" + time))
    .toISOString()
    .split(".")[0]
    .split("T"); // Corrected datetime to offset +00:00
  date = datetime[0];
  time = datetime[1];

  const query =
    "SELECT * FROM `roombot-oknmqj.sensors.data` WHERE room = " + `\"${room}\"` + " AND date = " + `\"${date}\"` + " AND time > " + `\"${time}\"`;
  const options = {
    query: query,
    location: "US"
  };

  return getRooms(0)
    .then(rooms => {
      var roomInfo = rooms.data.items.filter(item => {
        return item.resourceName == room;
      });

      if (roomInfo.length === 0) {
        console.log("ERROR: Cannot find room.");
      } else {
        roomInfo = roomInfo[0];
      }

      return calEventsList(roomInfo.resourceEmail, date + "T" + time + "Z", todate.toISOString())
        .then(res => {
          const events = res.data.items
            .filter(event => {
              return event.status === "confirmed";
            })
            .sort(byTime);

          if (events.length > 0 && new Date(Date.parse(events[0].end.dateTime)).getTime() > todate.getTime()) {
            var currentEvent = events[0];
            console.log(currentEvent);

            return BigQueryClient.query(options)
              .then(res => {
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

                  const tempRange = rangeOf(tempData);
                  const humRange = rangeOf(humData);
                  const motionDetected = motData.filter(val => val === 1).length;
                  var colorId;

                  if ((tempRange > 2 && humRange > 5 && motionDetected > 5) || humRange > 10 || motionDetected > 20) {
                    colorId = "6";
                  } else {
                    colorId = "2";
                  }

                  currentEvent.colorId = colorId;
                  console.log(colorId);

                  return calEventsUpdate(adminId, currentEvent.id, currentEvent)
                    .then(() => {
                      console.log("SUCCESS");
                    })
                    .catch(err => {
                      console.log(err);
                    });
                } else {
                  console.log("ERROR: No data available.");
                }
              })
              .catch(err => {
                console.log(err);
              });
          } else {
            console.log("No events");
          }
        })
        .catch(err => {
          console.log(err);
        });
    })
    .catch(err => {
      console.log(err);
    });
};
