const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const startAndRunServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("SERVER RUNNING at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB ERROR: #${e.message}`);
    process.exit(1);
  }
};

startAndRunServer();

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userNameQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(userNameQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      console.log("password < 6");
      response.status(400);
      response.send("Password is too short");
    } else {
      let hashedPassword = await bcrypt.hash(password, 10);

      const addNewUser = `INSERT INTO 
      user (username, password, name, gender)
      VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}');`;
      await db.run(addNewUser);
      response.send("User created successfully");
    }
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userNameQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(userNameQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let jwtToken;
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword) {
      const payload = {
        username: username,
      };
      jwtToken = jwt.sign(payload, "LOGIN_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// JWT TOKEN AUTH

const authenticateJWT = async (request, response, next) => {
  let jwtToken;
  try {
    const headerFiles = request.headers["authorization"];
    jwtToken = headerFiles.split(" ")[1];
  } catch (e) {
    console.log(e.message);
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "LOGIN_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 3

app.get("/user/tweets/feed/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const geQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userId = await db.get(geQuery);
  //   console.log(userId);
  const getTweetQuery = `
    SELECT 
        user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM 
        (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T1
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
    WHERE 
        follower.follower_user_id = ${userId.user_id}
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  const feedTweets = await db.all(getTweetQuery);
  response.send(feedTweets);
});

// API 4

app.get("/user/following/", authenticateJWT, async (request, response) => {
  const { username } = request;
  //   GET USER_ID
  const dbUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const dbUserId = await db.get(dbUserQuery);
  //   console.log(dbUserId);

  //   GET FOLLOWING LIST :
  const getFollowingIds = `SELECT 
  user.name 
  FROM user LEFT JOIN follower ON user.user_id = follower.following_user_id  
  WHERE follower.follower_user_id = ${dbUserId.user_id};`;
  const FollowingUserIds = await db.all(getFollowingIds);
  console.log(FollowingUserIds);

  response.send(FollowingUserIds);
});

// API 5

app.get("/user/followers/", authenticateJWT, async (request, response) => {
  const { username } = request;
  //   GET USER_ID
  const dbUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const dbUserId = await db.get(dbUserQuery);
  //   console.log(dbUserId);

  //   GET FOLLOWING LIST :
  const getFollowersIds = `SELECT 
  user.name 
  FROM user LEFT JOIN follower ON user.user_id = follower.follower_user_id  
  WHERE follower.following_user_id = ${dbUserId.user_id};`;
  const FollowersUserIds = await db.all(getFollowersIds);
  console.log(FollowersUserIds);

  response.send(FollowersUserIds);
});

// CHECK IF FOLLOWING

const followingOrNot = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  //   GET USER_ID
  const dbUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const dbUserId = await db.get(dbUserQuery);

  //   GET FOLLOWER LIST :
  const getFollowingIds = `SELECT following_user_id FROM follower WHERE follower_user_id = ${dbUserId.user_id};`;
  const FollowingUserIds = await db.all(getFollowingIds);

  //   GET FOLLOWING ID'S LIST
  let followingArray = FollowingUserIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  //   Find Tweeted By user_id
  const tweetedByQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetedBy = await db.get(tweetedByQuery);
  //   check tweetedBy is in FollowingList and send Response
  if (followingArray.includes(tweetedBy.user_id)) {
    // request.selfId = dbUserId.user_id;
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// API 6

app.get(
  "/tweets/:tweetId/",
  authenticateJWT,
  followingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;

    const GetLikesCount = `SELECT COUNT() AS likes from like WHERE tweet_id = ${tweetId};`;
    const likesCount = await db.get(GetLikesCount);
    const getReplyCount = `SELECT COUNT() AS replies from reply WHERE tweet_id = ${tweetId};`;
    const replyCount = await db.get(getReplyCount);
    const getTweetDetails = `SELECT tweet, date_time AS dateTime FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweet = await db.get(getTweetDetails);
    let getTweet = {
      tweet: tweet.tweet,
      likes: likesCount.likes,
      replies: replyCount.replies,
      dateTime: tweet.dateTime,
    };
    response.send(getTweet);
  }
);

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJWT,
  followingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;
    // USERS WHO LIKES THW TWEET
    const getLikedMembers = `SELECT user.username FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE  like.tweet_id = ${tweetId};`;
    const likedMembers = await db.all(getLikedMembers);

    const responseObj = {
      likes: likedMembers,
    };
    response.send(responseObj);
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateJWT,
  followingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;
    // USERS WHO REPLIED TO TWEET
    const getRepliedMembers = `SELECT user.name, reply.reply FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE  reply.tweet_id = ${tweetId};`;
    const repliedMembersList = await db.all(getRepliedMembers);
    // CREATE RESPONSE OBJECT
    const responseObject = {
      replies: repliedMembersList,
    };
    response.send(responseObject);
  }
);

// API 9

app.get("/user/tweets/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(userIdQuery);

  const getTweetsQuery = `
    SELECT tweet.tweet_id, Tweet.tweet, COUNT(like.like_id) AS likes, Tweet.date_time AS dateTime
    FROM (tweet INNER JOIN like on tweet.tweet_id = like.tweet_id ) 
    WHERE tweet.user_id = ${userId.user_id} GROUP BY tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetsQuery);

  let responseArray = [];
  for (let eachTweet of tweetDetails) {
    const getRepliesQuery = `SELECT COUNT() AS replies FROM reply WHERE tweet_id = ${eachTweet.tweet_id};`;
    const replies = await db.get(getRepliesQuery);
    let newTweet = {
      tweet: eachTweet.tweet,
      likes: eachTweet.likes,
      replies: replies.replies,
      dateTime: eachTweet.dateTime,
    };
    responseArray.push(newTweet);
  }
  response.send(responseArray);
});

// API 9

app.post("/user/tweets/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const userIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(userIdQuery);

  let dateTime = new Date();

  const createPostQuery = `INSERT INTO tweet
  (tweet, user_id, date_time)
  VALUES ('${tweet}', ${userId.user_id}, '${dateTime}');`;
  await db.run(createPostQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete("/tweets/:tweetId/", authenticateJWT, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const isUsersQuery = `SELECT tweet.tweet_id FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
    WHERE user.username = '${username}';`;
  let tweetsOfUserDb = await db.all(isUsersQuery);

  let tweetsOfUser = [];
  for (let eachTweet of tweetsOfUserDb) {
    tweetsOfUser.push(eachTweet.tweet_id);
  }

  if (tweetsOfUser.includes(parseInt(tweetId))) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
