import play from "play-dl";

async function test() {
  const url = "https://www.youtube.com/watch?v=MaLz1eeXWtQ";

  const stream = await play.stream(url);
  console.log("Stream obtenu avec succès !");
  console.log("Type :", stream.type);
}

test().catch((err) => console.error("ERREUR :", err));