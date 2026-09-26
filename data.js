window.USHER_REFERENDUM_DATA = {
  api: {
    constituencySearch: "https://members-api.parliament.uk/api/Location/Constituency/Search",
    pageSize: 20,
    expectedTotal: 650
  },

  years: Array.from({length:30},(_,i)=>1997+i),

  themeForYear(year){
    if(year <= 1999) return "1997";
    if(year <= 2005) return "2001";
    if(year <= 2014) return "2010";
    if(year <= 2019) return "2016";
    return "2024";
  },

  themes: {
    "1997": {label:"1997 Classic", className:"theme-1997"},
    "2001": {label:"2001 Glass", className:"theme-2001"},
    "2010": {label:"2010 Night Studio", className:"theme-2010"},
    "2016": {label:"2016 Referendum Era", className:"theme-2016"},
    "2024": {label:"2024 Clean Studio", className:"theme-2024"}
  },

  side: {
    IN: {
      label:"IN",
      meaning:"Remain in the United Kingdom",
      colour:"#ffca1c",
      text:"#111111"
    },
    OUT: {
      label:"OUT",
      meaning:"Usher becomes independent",
      colour:"#082f70",
      text:"#ffffff"
    }
  }
};