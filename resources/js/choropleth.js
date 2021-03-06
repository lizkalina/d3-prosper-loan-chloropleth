/* The loadData function is called as page loads, which asynchronously loads
both the Prosper loan and US states GeoJSON files, then aggregates the loan
data to the year and state levels. Once these steps finish, the choropleth is
rendered and the year-by-year animation runs. Finally, the year slider
renders allowing the user to explore on their own.
*/

  // Stores aggregated loan data & state geoJSON
  var pageData = {};

  window.onload = loadData();

  //asynchronously loads both the Prosper loan and US states GeoJSON files
  function loadData(){

    queue().defer(d3.csv, 'data/prosperLoanData.csv', function(d) {
                d['loanStart'] = new Date(d['LoanOriginationDate']);
                d['loanYear'] = d['loanStart'].getFullYear();
                if ((d.BorrowerState != '') & (d.loanYear != 2014)){ return d; }
              })
           .defer(d3.json, 'data/us_states.json')
           .await(callback);
  }

  function callback(error, loanData, geoData){

    //aggregates the loan data to the year and state levels
    function formatData(loanData, callback){

      function agg_state_by_year(leaves){

        var year = leaves[0]['loanYear'],
            state = leaves[0]['BorrowerState'],
            state_pop = 0;

        if (state != '') {
          var key = _.findKey( Object.values(abbr), { 'abbr':  state} );
          var state_pop = Object.values(abbr)[key]['pop'];
        }

        var total = d3.sum(leaves, function(d){
            return d['LoanOriginalAmount'];
        });

        //loan density (i.e. total loan amount / state population) by state & year
        var norm_total = total / state_pop;

        return {
          'year': year,
          'state': state,
          'total': norm_total
        }
      }

      var nested = d3.nest()
                     .key(function(d) {
                        return d['loanStart'].getUTCFullYear();
                     })
                     .key(function(d) {
                       return d['BorrowerState'];
                     })
                     .rollup(agg_state_by_year)
                     .entries(loanData);

      var year = nested[0].key;

      pageData['loans'] = nested;
      pageData['geo'] = geoData;
      pageData['colorScale'] = colorScale();

      callback(nested, geoData, year)

    }

    //choropleth is rendered and the year-by-year animation runs
    formatData(loanData, function(nested, geoData, year){
        addHeader();
        colorMap(nested, geoData, year);
        runYearAnimation();
    });
  }

  //renders map of US with each state colored by loan density
  function colorMap(nested, geoData, year){

      var margin = 200,
          width = 1400 - margin,
          height = 550 - margin;

      pageData['svg'] = d3.select('body')
          .append('svg')
          .attr('class', 'svg_cont')
          .attr('width', width + margin)
          .attr('height', height + margin)
          .attr('x',0)
          .attr('y',10000)
          .append('g')
          .attr('class', 'map');

      var path = d3.geo.path();

      var yearKey = _.findKey(nested,{ 'key': year });

      var map = pageData['svg'].selectAll('path')
                    .data(geoData.features)
                    .enter()
                    .append('path')
                    .attr('d', path)
                    .style('fill', function(d) {
                      var abbrKey = _.findKey(nested[yearKey].values,
                                    { 'key': abbr[d.properties.name]['abbr'] });
                      if (abbrKey) {
                        var total = nested[yearKey].values[abbrKey].values.total;
                        return pageData['colorScale'](total);
                      }
                      return 'rgb(232,232,232)' //light grey
                    })
                    .style('stroke', 'black')
                    .style('stroke-width', 0.5);

      addLegend();
  }

  //renders year slider which updates choropleth loan densities
  function addSlider(){

      var slider_div = d3.select('footer')
                        .append('div')
                        .attr('width', 800)
                        .attr('class', 'slider');

      pageData['slider']  = d3.select('.slider')
                     .call(d3.slider()
                     .value(2013)
                     .axis(true)
                     .min(2006)
                     .max(2013)
                     .step(1)
                     .on('slide', function(evt, year) {

                         d3.selectAll('.svg_cont')
                           .remove();

                         colorMap(pageData['loans'],
                                  pageData['geo'],
                                  year.toString());
                    })
                  );
  }

  //creates color scale, which returns hex code for loan density value
  function colorScale(){

    var totalMin = d3.min(pageData['loans'], function(d) {
        return d.values[0].values['total'];
    });

    var totalMax = d3.max(pageData['loans'], function(d) {
        return d.values[0].values['total'];
    });

    var color = d3.scaleSequential(d3.interpolateYlGn)
                  .domain([totalMin,totalMax]);

    return color
  }

  function addHeader(){
    d3.select('body')
      .append('h1')
      .attr('id', 'title')
      .html('Prosper Loan Density by State from 2006 - 2013');
  }

  function addSummary(){

    d3.select('footer')
      .append('div')
      .attr('class','sum_cont');

    d3.select('.sum_cont')
      .append('h1')
      .attr('class','sum_cont')
      .html('Observations');

    d3.select('.sum_cont')
      .append('p')
      .attr('class','sum_cont')
      .html(summary_text);
  }


  //adds color legend for the map
  function addLegend(){

    var width = 960,
        height = 500;
        color = pageData['colorScale'],
        domain = color.domain(),
        min_value = domain[0],
        max_value = domain[1];

    function translateDomain(num){
      return (max_value/6) * num
    }

    var color_domain = [min_value,
                        translateDomain(2),
                        translateDomain(3),
                        translateDomain(4),
                        translateDomain(5),
                        translateDomain(6)];

    var legend_labels = ['$' + min_value.toFixed(2),
                         '$' + translateDomain(2).toFixed(2),
                         '$' + translateDomain(3).toFixed(2),
                         '$' + translateDomain(4).toFixed(2),
                         '$' + translateDomain(5).toFixed(2),
                         '$' + translateDomain(6).toFixed(2)];

    var legend = pageData['svg']
                  .selectAll('g.legend')
                  .data(color_domain)
                  .enter()
                  .append('g')
                  .attr('class', 'legend');

    var ls_w = 20,
        ls_h = 20;


    legend.append('rect')
          .attr('x', width-80)
          .attr('y', function(d, i){ return height - (i*ls_h) - 2*ls_h;})
          .attr('width', ls_w)
          .attr('height', ls_h)
          .style('fill', function(d, i) { return color(d); })
          .style('opacity', 0.8);

    legend.append('text')
          .attr('x', width-55)
          .attr('y', function(d, i){ return height - (i*ls_h) - ls_h - 4;})
          .text(function(d, i){ return legend_labels[i]; });

    legend.append('text')
          .attr('x', width-110)
          .attr('y', function(d, i){ return height - (6*ls_h) - ls_h - 10;})
          .text('Loan Dollars / Person');

  }

  //cycles through loan years & updates choropleth when page loads
  function runYearAnimation(){

    var years = ['2007','2008','2009','2010','2011','2012','2013'],
        yearIdx = 0;

    var yearInterval = setInterval(function(){

      d3.selectAll('.svg_cont')
        .remove();

      d3.selectAll('#countdown')
        .remove()

      colorMap(pageData['loans'],
               pageData['geo'],
               years[yearIdx]);

      d3.select('footer')
        .append('h1')
        .attr('id','countdown')
        .html(years[yearIdx]);

      if (years[yearIdx] == '2013') {
        clearInterval(yearInterval)

        setTimeout(function(){

          d3.selectAll('#countdown')
            .remove()

          addSlider();
          addSummary();

        }, 2000);
      }

      yearIdx++;

    }, 1200);

  }

  //observations summary
  var summary_text = 'Prosper is a peer-to-peer lender and the dataset used includes 113,937 loans with 81 variables (such as loan amount, borrower rate, borrower state) for each loan. I choose to investigate the progression of loan amount by state to get a picture of where the highest loan density occurs. Once I plotted overall loan density, I included a time component to show the geographic fluctuations in lendees. What I discovered was that the loan density traces the story of Prosper and the US economy as a whole; loan density starts out strongest on the West Coast (where Prosper was founded in 2005), then follows the movement of the US economy (with dips in 2008 - 2009).'

  //state abbrevation & population lookup
  var abbr = {
   'Alabama': {'abbr': 'AL', 'pop': 4780131},
   'Alaska': {'abbr': 'AK', 'pop': 710249},
   'American Samoa': {'abbr': 'AS'},
   'Arizona': {'abbr': 'AZ', 'pop': 6392301},
   'Arkansas': {'abbr': 'AR', 'pop': 2916025},
   'California': {'abbr': 'CA', 'pop': 37254522},
   'Colorado': {'abbr': 'CO', 'pop': 5029324},
   'Connecticut': {'abbr': 'CT', 'pop': 3574114},
   'Delaware': {'abbr': 'DE', 'pop': 897936},
   'District of Columbia': {'abbr': 'DC', 'pop': 601766},
   'Federated States Of Micronesia': {'abbr': 'FM'},
   'Florida': {'abbr': 'FL', 'pop': 18804592},
   'Georgia': {'abbr': 'GA', 'pop': 9688680},
   'Guam': {'abbr': 'GU'},
   'Hawaii': {'abbr': 'HI', 'pop': 1360301},
   'Idaho': {'abbr': 'ID', 'pop': 1567650},
   'Illinois': {'abbr': 'IL', 'pop': 12831574},
   'Indiana': {'abbr': 'IN', 'pop': 6484136},
   'Iowa': {'abbr': 'IA', 'pop': 3046869},
   'Kansas': {'abbr': 'KS', 'pop': 2853129},
   'Kentucky': {'abbr': 'KY', 'pop': 4339344},
   'Louisiana': {'abbr': 'LA', 'pop': 4533479},
   'Maine': {'abbr': 'ME', 'pop': 1328364},
   'Marshall Islands': {'abbr': 'MH'},
   'Maryland': {'abbr': 'MD', 'pop': 5773786},
   'Massachusetts': {'abbr': 'MA', 'pop': 6547813},
   'Michigan': {'abbr': 'MI', 'pop': 9884129},
   'Minnesota': {'abbr': 'MN', 'pop': 5303924},
   'Mississippi': {'abbr': 'MS', 'pop': 2968103},
   'Missouri': {'abbr': 'MO', 'pop': 5988928},
   'Montana': {'abbr': 'MT', 'pop': 989414},
   'Nebraska': {'abbr': 'NE', 'pop': 1826334},
   'Nevada': {'abbr': 'NV', 'pop': 2700691},
   'New Hampshire': {'abbr': 'NH', 'pop': 1316461},
   'New Jersey': {'abbr': 'NJ', 'pop': 8791953},
   'New Mexico': {'abbr': 'NM', 'pop': 2059198},
   'New York': {'abbr': 'NY', 'pop': 19378110},
   'North Carolina': {'abbr': 'NC', 'pop': 9535688},
   'North Dakota': {'abbr': 'ND', 'pop': 672591},
   'Northern Mariana Islands': {'abbr': 'MP'},
   'Ohio': {'abbr': 'OH', 'pop': 11536727},
   'Oklahoma': {'abbr': 'OK', 'pop': 3751615},
   'Oregon': {'abbr': 'OR', 'pop': 3831072},
   'Palau': {'abbr': 'PW'},
   'Pennsylvania': {'abbr': 'PA', 'pop': 12702857},
   'Puerto Rico': {'abbr': 'PR', 'pop': 3726157},
   'Rhode Island': {'abbr': 'RI', 'pop': 1052940},
   'South Carolina': {'abbr': 'SC', 'pop': 4625410},
   'South Dakota': {'abbr': 'SD', 'pop': 814195},
   'Tennessee': {'abbr': 'TN', 'pop': 6346298},
   'Texas': {'abbr': 'TX', 'pop': 25146100},
   'Utah': {'abbr': 'UT', 'pop': 2763888},
   'Vermont': {'abbr': 'VT', 'pop': 625741},
   'Virgin Islands': {'abbr': 'VI'},
   'Virginia': {'abbr': 'VA', 'pop': 8001041},
   'Washington': {'abbr': 'WA', 'pop': 6724545},
   'West Virginia': {'abbr': 'WV', 'pop': 1853011},
   'Wisconsin': {'abbr': 'WI', 'pop': 5687289},
   'Wyoming': {'abbr': 'WY', 'pop': 563767}
  }
