import { Devvit } from "@devvit/public-api";
import { WordLinkGame } from "./components/WordLinkGame.js";
import { LoadingAnimation } from "./components/LoadingAnimation.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
  realtime: true
});

Devvit.addCustomPostType({
  name: "WordLink",
  height: "tall",
  render: (context) => <WordLinkGame context={context} />,
});

Devvit.addMenuItem({
  label: "Create WordLink",
  location: "subreddit",
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();

    try {
      const post = await reddit.submitPost({
        title: "WordLink: Test Your Vocabulary!",
        subredditName: subreddit.name,
        preview: <LoadingAnimation />,
      });

      ui.showToast({ text: "WordLink post created!", appearance: "success" });
      ui.navigateTo(post);
    } catch (error) {
      console.error("Error creating post:", error);
      ui.showToast({
        text: "Error creating WordLink post",
        appearance: "neutral",
      });
    }
  },
});

export default Devvit;
