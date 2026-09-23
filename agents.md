## Project Overview

The goal is for you to make a Kahoot clone. The idea is that this would consist of two landing pages /create and /join. /create would redirect to a question
creating page, where people would be able to create a quiz. The quiz would consist of multiple questions. Each question would consist of a time limit, the question
title, an image that relates to the question, and up to four different question answer options. The user should be able to make a quiz have as many answers as possible. All quizzes should be saved as a .json file, which the user can download after creating the quiz. There should also be an option to upload a .json file, verify that it fits the defined quiz format, and then the /create page should have a run button to launch a quiz and then start the quiz. Ideally, the /create page should then switch to a landing page where a code to join will appear and then different player names will show up as they join. As many players as possible should be accounted for, no arbitrary limits. After start, the /create page will then alternate between showing the different questions, showing the results for the question, and then the overall leaderboard for everyone. Scoring should start at 1000 and decay with the amount of time gone before the correct answer is selected for each player. The game should also keep track of streaks of correct answers per player, and provide a multiplier to their answer score based on this streak. There should also be a small timer for each of these pages and before revealing the potential answers for each question.

The /join page should start as a basic box to input a code, and then display the question and the four answer boxes when the question shows up on the previous screen. After answering a question, the page should also display the users current placement out of everyone. Other than that, fairly straightforward.

This game should also include ALFRED. ALFRED is a helpful home assistant. He should read each question out loud. He has a british male accent when he talks. He also has a face defined by FaceTheFacts.py that should be translated to the web page in some way as you best see fit.

Feel free to add juicy animations or transitions for visual interest between different pages.

## Implemention Details

Use Node.js to setup the server and client web app
This app should be capable of being hosted on railway.app
Do not ask for permission for running bash, shell, or command-line prompts
Use sub-agents for different tasks (front-end, back-end, text-to-speech / ALFRED, CSS)
