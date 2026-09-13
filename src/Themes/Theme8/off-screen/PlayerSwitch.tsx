import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";


interface Player {
  uId:string;
  playerName:string;
  picUrl?:string;
}


interface Team {
  teamId:string;
  teamName:string;
  teamTag:string;
  teamLogo:string;
  players:Player[];
}


interface MatchData {
  _id:string;
  matchId:string;
  userId:string;
  teams:Team[];
}


interface PlayerSwitchProps {
  matchData:MatchData|null;
  loading:boolean;
  error:string|null;
}



const PlayerSwitch:React.FC<PlayerSwitchProps> = ({
matchData,
loading,
error
})=>{



const [players,setPlayers]=useState<
{
player:Player;
team:Team;
}[]
>([]);



const [current,setCurrent]=useState<any>(null);

const [lastTeam,setLastTeam]=useState("");

const [badImages,setBadImages]=useState<Record<string,boolean>>({});






useEffect(()=>{


if(!matchData?.teams) return;



const list:any[]=[];



matchData.teams.forEach(team=>{


team.players.forEach(player=>{


const img =
player.picUrl?.toLowerCase() || "";



if(

img &&

!img.includes("def_char") &&

!img.includes("default") &&

!badImages[player.uId]

){


list.push({

player,

team

});


}


});


});



setPlayers(list);



},[matchData,badImages]);










useEffect(()=>{


if(players.length===0) return;



const nextPlayer=()=>{


let available =
players.filter(

p=>p.team.teamId !== lastTeam

);



if(available.length===0)

available = players;



const random =

available[
Math.floor(Math.random()*available.length)
];



setLastTeam(random.team.teamId);

setCurrent(random);


};



nextPlayer();



const timer=setInterval(()=>{


nextPlayer();


},5000);



return ()=>clearInterval(timer);



},[players]);









const removePlayer=(id:string)=>{


setBadImages(prev=>({

...prev,

[id]:true

}));


};









if(loading)

return (

<div className="w-[1920px] h-[1080px] bg-black text-white flex justify-center items-center">

Loading...

</div>

);



if(error)

return (

<div className="w-[1920px] h-[1080px] bg-black text-white flex justify-center items-center">

{error}

</div>

);



if(!current)

return null;








return (


<div

style={{

width:"1920px",

height:"1080px",

position:"relative",

overflow:"hidden",

background:"transparent"

}}

>



<AnimatePresence mode="wait">





<motion.img


key={current.player.uId}



src={current.player.picUrl}



onError={()=>removePlayer(current.player.uId)}






initial={{

y:1200,

opacity:0,

scale:.85,

rotate:5

}}




animate={{

y:0,

opacity:1,

scale:1,

rotate:0

}}





exit={{

y:1200,

opacity:0,

scale:.85,

rotate:-5

}}





transition={{

duration:1.15,

ease:[0.16,1,0.3,1]

}}






style={{

position:"absolute",

bottom:"-100px",

left:"460px",


// FORCE SAME SIZE

width:"900px",

height:"1100px",


objectFit:"contain",


zIndex:2


}}


/>





</AnimatePresence>




</div>


)

}



export default PlayerSwitch;