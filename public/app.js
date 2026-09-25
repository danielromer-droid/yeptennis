function updateResultsDate() {

  const tabs =
    document.querySelector(
      ".results-card .tabs"
    );

  if (!tabs) {
    return;
  }

  /*
   * Remove the old hard-coded
   * date from index.html.
   */

  tabs
    .querySelectorAll(
      "span:not(.api-date)"
    )
    .forEach(
      element => {
        element.remove();
      }
    );


  let date =
    tabs.querySelector(
      ".api-date"
    );


  if (!date) {

    date =
      document.createElement(
        "span"
      );

    date.className =
      "api-date";

    date.style.marginLeft =
      "auto";

    tabs.appendChild(
      date
    );
  }


  if (
    todayData &&
    todayData.date
  ) {

    date.textContent =
      `▣ ${formatDate(
        todayData.date
      )}`;
  }
}
